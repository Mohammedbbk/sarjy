create table public.linear_actions (
  id uuid primary key,
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  standup_id uuid not null references public.standups(id) on delete cascade,
  entry_id uuid not null,
  source_text text not null,
  issue_id text not null,
  issue_identifier text not null,
  issue_title text not null,
  issue_url text not null,
  kind text not null check (kind in ('comment', 'status')),
  body text,
  from_state_id text,
  from_state_name text,
  to_state_id text,
  to_state_name text,
  status text not null default 'proposed' check (status in ('proposed', 'applying', 'succeeded', 'failed', 'uncertain', 'invalidated')),
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'comment' and body is not null and to_state_id is null) or
         (kind = 'status' and body is null and to_state_id is not null))
);
create index linear_actions_by_standup on public.linear_actions(standup_id, created_at);
create index linear_actions_by_visitor on public.linear_actions(visitor_id, created_at desc);
alter table public.linear_actions enable row level security;

create or replace function public.sarjy_action_json(p_action public.linear_actions)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', p_action.id, 'standupId', p_action.standup_id, 'entryId', p_action.entry_id,
    'sourceText', p_action.source_text, 'issueId', p_action.issue_id,
    'issueIdentifier', p_action.issue_identifier, 'issueTitle', p_action.issue_title,
    'issueUrl', p_action.issue_url, 'kind', p_action.kind, 'body', p_action.body,
    'fromStateId', p_action.from_state_id, 'fromStateName', p_action.from_state_name,
    'toStateId', p_action.to_state_id, 'toStateName', p_action.to_state_name,
    'status', p_action.status, 'result', p_action.result,
    'createdAt', p_action.created_at, 'updatedAt', p_action.updated_at
  )
$$;

create or replace function public.sarjy_action_entry(p_doc jsonb, p_entry_id uuid)
returns jsonb language sql stable as $$
  select entry from (
    select jsonb_array_elements(coalesce(p_doc->'progress', '[]'::jsonb)) as entry
    union all select jsonb_array_elements(coalesce(p_doc->'blockers', '[]'::jsonb))
    union all select jsonb_array_elements(coalesce(p_doc->'commitments', '[]'::jsonb))
  ) entries where entry->>'id' = p_entry_id::text limit 1
$$;

create or replace function public.sarjy_invalidate_actions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.linear_actions a
    set status = 'invalidated', result = 'The saved update changed. Ask Sarjy for a new proposal.', updated_at = now()
  where a.standup_id = new.id and a.status = 'proposed' and (
    public.sarjy_action_entry(new.doc, a.entry_id) is null or
    coalesce((public.sarjy_action_entry(new.doc, a.entry_id)->>'dropped')::boolean, false) or
    public.sarjy_action_entry(new.doc, a.entry_id)->>'text' is distinct from a.source_text or
    public.sarjy_action_entry(new.doc, a.entry_id)->>'issueId' is distinct from a.issue_id
  );
  return new;
end $$;
create trigger linear_actions_invalidate_after_correction
after update of doc on public.standups
for each row execute function public.sarjy_invalidate_actions();

create or replace function public.sarjy_propose_action(
  p_visitor_id uuid, p_standup_id uuid, p_action_id uuid, p_entry_id uuid,
  p_issue_id text, p_issue_identifier text, p_issue_title text, p_issue_url text,
  p_kind text, p_body text, p_from_state_id text, p_from_state_name text,
  p_to_state_id text, p_to_state_name text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.standups; a public.linear_actions; entry jsonb;
begin
  select * into a from public.linear_actions where id = p_action_id and visitor_id = p_visitor_id and standup_id = p_standup_id;
  if found then return jsonb_build_object('status', 'replayed', 'action', public.sarjy_action_json(a)); end if;
  select * into s from public.standups where id = p_standup_id and visitor_id = p_visitor_id for update;
  if not found or s.status <> 'active' then return jsonb_build_object('status', 'not_found'); end if;
  entry := public.sarjy_action_entry(s.doc, p_entry_id);
  if entry is null or coalesce((entry->>'dropped')::boolean, false) or entry->>'issueId' is distinct from p_issue_id then
    return jsonb_build_object('status', 'invalid_entry');
  end if;
  if p_kind not in ('comment', 'status') or
     (p_kind = 'comment' and (nullif(btrim(p_body), '') is null or length(p_body) > 500 or p_to_state_id is not null)) or
     (p_kind = 'status' and (p_body is not null or nullif(p_to_state_id, '') is null)) then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  insert into public.linear_actions(id, visitor_id, standup_id, entry_id, source_text,
    issue_id, issue_identifier, issue_title, issue_url, kind, body,
    from_state_id, from_state_name, to_state_id, to_state_name)
  values (p_action_id, p_visitor_id, p_standup_id, p_entry_id, entry->>'text',
    p_issue_id, p_issue_identifier, p_issue_title, p_issue_url, p_kind, p_body,
    p_from_state_id, p_from_state_name, p_to_state_id, p_to_state_name)
  returning * into a;
  return jsonb_build_object('status', 'ok', 'action', public.sarjy_action_json(a));
end $$;

create or replace function public.sarjy_list_actions(p_visitor_id uuid, p_standup_id uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(public.sarjy_action_json(a) order by a.created_at desc), '[]'::jsonb)
  from (select * from public.linear_actions
        where visitor_id = p_visitor_id and (p_standup_id is null or standup_id = p_standup_id)
        order by created_at desc limit 20) a
  join public.standups s on s.id = a.standup_id
  where s.visitor_id = p_visitor_id
$$;

create or replace function public.sarjy_read_action(p_visitor_id uuid, p_action_id uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select public.sarjy_action_json(a) from public.linear_actions a
  where a.id = p_action_id and a.visitor_id = p_visitor_id
$$;

create or replace function public.sarjy_claim_action(p_visitor_id uuid, p_action_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.linear_actions; s public.standups; entry jsonb;
begin
  select * into a from public.linear_actions where id = p_action_id and visitor_id = p_visitor_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if a.status <> 'proposed' then return jsonb_build_object('status', a.status, 'action', public.sarjy_action_json(a)); end if;
  select * into s from public.standups where id = a.standup_id and visitor_id = p_visitor_id;
  entry := public.sarjy_action_entry(s.doc, a.entry_id);
  if entry is null or coalesce((entry->>'dropped')::boolean, false) or
     entry->>'text' is distinct from a.source_text or entry->>'issueId' is distinct from a.issue_id then
    update public.linear_actions set status = 'invalidated', result = 'The saved update changed. Ask Sarjy for a new proposal.', updated_at = now()
      where id = a.id returning * into a;
    return jsonb_build_object('status', 'invalidated', 'action', public.sarjy_action_json(a));
  end if;
  update public.linear_actions set status = 'applying', updated_at = now() where id = a.id returning * into a;
  return jsonb_build_object('status', 'claimed', 'action', public.sarjy_action_json(a));
end $$;

create or replace function public.sarjy_record_action_result(p_action_id uuid, p_status text, p_result text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.linear_actions;
begin
  if p_status not in ('succeeded', 'failed', 'uncertain') then return null; end if;
  update public.linear_actions set status = p_status, result = left(p_result, 500), updated_at = now()
    where id = p_action_id and status in ('applying', 'uncertain') returning * into a;
  if not found then select * into a from public.linear_actions where id = p_action_id; end if;
  return case when a.id is null then null else public.sarjy_action_json(a) end;
end $$;

revoke all on public.linear_actions from anon, authenticated;
revoke all on function public.sarjy_action_json(public.linear_actions), public.sarjy_action_entry(jsonb, uuid),
  public.sarjy_invalidate_actions(),
  public.sarjy_propose_action(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text),
  public.sarjy_list_actions(uuid, uuid), public.sarjy_read_action(uuid, uuid), public.sarjy_claim_action(uuid, uuid),
  public.sarjy_record_action_result(uuid, text, text) from public, anon, authenticated;
grant execute on function public.sarjy_propose_action(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text),
  public.sarjy_list_actions(uuid, uuid), public.sarjy_read_action(uuid, uuid), public.sarjy_claim_action(uuid, uuid),
  public.sarjy_record_action_result(uuid, text, text) to service_role;
