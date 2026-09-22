create extension if not exists pgcrypto;

create table public.visitors (
  id uuid primary key default gen_random_uuid(),
  credential_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.standups (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'finished')),
  stage text not null default 'review' check (stage in ('review', 'blockers', 'today', 'confirm', 'finished')),
  revision integer not null default 0 check (revision >= 0),
  doc jsonb not null,
  summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index standups_one_active_per_visitor on public.standups(visitor_id) where status = 'active';

create table public.workflow_commands (
  standup_id uuid not null references public.standups(id) on delete cascade,
  request_id uuid not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (standup_id, request_id)
);

create table public.voice_bindings (
  room_name text primary key,
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  standup_id uuid not null references public.standups(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.visitors enable row level security;
alter table public.standups enable row level security;
alter table public.workflow_commands enable row level security;
alter table public.voice_bindings enable row level security;

create or replace function public.sarjy_snapshot(p_standup public.standups)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'standupId', p_standup.id,
    'revision', p_standup.revision,
    'stage', p_standup.stage,
    'status', p_standup.status,
    'doc', p_standup.doc,
    'summary', p_standup.summary,
    'startedAt', p_standup.created_at,
    'finishedAt', p_standup.finished_at
  )
$$;

create or replace function public.sarjy_claim_visitor(p_credential_hash text, p_ttl_days integer, p_capacity integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.visitors;
begin
  perform pg_advisory_xact_lock(hashtext('sarjy_visitor_capacity'));
  select * into v from public.visitors where credential_hash = p_credential_hash for update;
  if found then
    update public.visitors set last_seen_at = now(), expires_at = now() + make_interval(days => p_ttl_days)
      where id = v.id returning * into v;
    return jsonb_build_object('status', 'ok', 'visitor', to_jsonb(v));
  end if;
  delete from public.visitors where expires_at < now();
  if (select count(*) from public.visitors) >= p_capacity then
    return jsonb_build_object('status', 'at_capacity');
  end if;
  insert into public.visitors(credential_hash, expires_at)
    values (p_credential_hash, now() + make_interval(days => p_ttl_days)) returning * into v;
  return jsonb_build_object('status', 'ok', 'visitor', to_jsonb(v));
end $$;

create or replace function public.sarjy_open_standup(p_visitor_id uuid, p_empty_doc jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.standups; was_resumed boolean := true;
begin
  select * into s from public.standups where visitor_id = p_visitor_id and status = 'active' for update;
  if not found then
    was_resumed := false;
    insert into public.standups(visitor_id, doc) values (p_visitor_id, p_empty_doc) returning * into s;
  end if;
  return jsonb_build_object('status', 'ok', 'resumed', was_resumed, 'snapshot', public.sarjy_snapshot(s));
exception when unique_violation then
  select * into s from public.standups where visitor_id = p_visitor_id and status = 'active';
  return jsonb_build_object('status', 'ok', 'resumed', true, 'snapshot', public.sarjy_snapshot(s));
end $$;

create or replace function public.sarjy_read_standup(p_visitor_id uuid, p_standup_id uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select public.sarjy_snapshot(s) from public.standups s where s.id = p_standup_id and s.visitor_id = p_visitor_id
$$;

create or replace function public.sarjy_last_summary(p_visitor_id uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select summary from public.standups where visitor_id = p_visitor_id and status = 'finished'
  order by finished_at desc limit 1
$$;

create or replace function public.sarjy_recorded_command(p_visitor_id uuid, p_standup_id uuid, p_request_id uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('snapshot', c.snapshot)
  from public.workflow_commands c join public.standups s on s.id = c.standup_id
  where c.standup_id = p_standup_id and c.request_id = p_request_id and s.visitor_id = p_visitor_id
$$;

create or replace function public.sarjy_commit_command(p_visitor_id uuid, p_standup_id uuid, p_expected_revision integer, p_request_id uuid, p_stage text, p_doc jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.standups; recorded jsonb;
begin
  select snapshot into recorded from public.workflow_commands where standup_id = p_standup_id and request_id = p_request_id;
  if found then return jsonb_build_object('status', 'replayed', 'snapshot', recorded); end if;
  select * into s from public.standups where id = p_standup_id and visitor_id = p_visitor_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if s.status = 'finished' then return jsonb_build_object('status', 'finished', 'snapshot', public.sarjy_snapshot(s)); end if;
  if s.revision <> p_expected_revision then return jsonb_build_object('status', 'stale', 'snapshot', public.sarjy_snapshot(s)); end if;
  update public.standups set stage = p_stage, doc = p_doc, revision = revision + 1, updated_at = now()
    where id = s.id returning * into s;
  recorded := public.sarjy_snapshot(s);
  insert into public.workflow_commands(standup_id, request_id, snapshot) values (s.id, p_request_id, recorded);
  return jsonb_build_object('status', 'ok', 'snapshot', recorded);
end $$;

create or replace function public.sarjy_finish_standup(p_visitor_id uuid, p_standup_id uuid, p_expected_revision integer, p_request_id uuid, p_summary jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.standups; recorded jsonb;
begin
  select snapshot into recorded from public.workflow_commands where standup_id = p_standup_id and request_id = p_request_id;
  if found then return jsonb_build_object('status', 'replayed', 'snapshot', recorded); end if;
  select * into s from public.standups where id = p_standup_id and visitor_id = p_visitor_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if s.revision <> p_expected_revision then return jsonb_build_object('status', 'stale', 'snapshot', public.sarjy_snapshot(s)); end if;
  if coalesce(s.doc #>> '{coverage,review}', 'unasked') not in ('captured', 'explicit_none', 'skipped')
     or coalesce(s.doc #>> '{coverage,blockers}', 'unasked') not in ('captured', 'explicit_none', 'skipped')
     or coalesce(s.doc #>> '{coverage,today}', 'unasked') not in ('captured', 'explicit_none', 'skipped') then
    return jsonb_build_object('status', 'incomplete', 'snapshot', public.sarjy_snapshot(s));
  end if;
  if jsonb_array_length(coalesce(s.doc -> 'unresolvedReferences', '[]'::jsonb)) > 0 then
    return jsonb_build_object('status', 'unresolved_reference', 'snapshot', public.sarjy_snapshot(s));
  end if;
  update public.standups set status = 'finished', stage = 'finished', summary = p_summary,
    revision = revision + 1, updated_at = now(), finished_at = now() where id = s.id returning * into s;
  recorded := public.sarjy_snapshot(s);
  insert into public.workflow_commands(standup_id, request_id, snapshot) values (s.id, p_request_id, recorded);
  return jsonb_build_object('status', 'ok', 'snapshot', recorded);
end $$;

create or replace function public.sarjy_bind_room(p_visitor_id uuid, p_standup_id uuid, p_room_name text, p_token_hash text, p_expires_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.standups where id = p_standup_id and visitor_id = p_visitor_id and status = 'active') then return false; end if;
  delete from public.voice_bindings where standup_id = p_standup_id;
  insert into public.voice_bindings(room_name, visitor_id, standup_id, token_hash, expires_at)
    values (p_room_name, p_visitor_id, p_standup_id, p_token_hash, p_expires_at)
    on conflict (room_name) do update set visitor_id = excluded.visitor_id, standup_id = excluded.standup_id,
      token_hash = excluded.token_hash, expires_at = excluded.expires_at, created_at = now();
  return true;
end $$;

create or replace function public.sarjy_resolve_binding(p_room_name text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.voice_bindings;
begin
  select * into b from public.voice_bindings where room_name = p_room_name and token_hash = p_token_hash and expires_at > now();
  if not found then return jsonb_build_object('status', 'rejected'); end if;
  return jsonb_build_object('status', 'ok', 'visitorId', b.visitor_id, 'standupId', b.standup_id);
end $$;

revoke all on public.visitors, public.standups, public.workflow_commands, public.voice_bindings from anon, authenticated;
revoke all on function public.sarjy_snapshot(public.standups), public.sarjy_claim_visitor(text, integer, integer),
  public.sarjy_open_standup(uuid, jsonb), public.sarjy_read_standup(uuid, uuid), public.sarjy_last_summary(uuid),
  public.sarjy_recorded_command(uuid, uuid, uuid), public.sarjy_commit_command(uuid, uuid, integer, uuid, text, jsonb),
  public.sarjy_finish_standup(uuid, uuid, integer, uuid, jsonb), public.sarjy_bind_room(uuid, uuid, text, text, timestamptz),
  public.sarjy_resolve_binding(text, text) from public, anon, authenticated;
grant execute on function public.sarjy_claim_visitor(text, integer, integer), public.sarjy_open_standup(uuid, jsonb),
  public.sarjy_read_standup(uuid, uuid), public.sarjy_last_summary(uuid), public.sarjy_recorded_command(uuid, uuid, uuid),
  public.sarjy_commit_command(uuid, uuid, integer, uuid, text, jsonb), public.sarjy_finish_standup(uuid, uuid, integer, uuid, jsonb),
  public.sarjy_bind_room(uuid, uuid, text, text, timestamptz), public.sarjy_resolve_binding(text, text) to service_role;
