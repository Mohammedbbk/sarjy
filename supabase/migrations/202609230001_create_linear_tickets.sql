alter table public.linear_actions add column team_id text;
alter table public.linear_actions drop constraint linear_actions_kind_check;
alter table public.linear_actions drop constraint linear_actions_check;
alter table public.linear_actions add constraint linear_actions_kind_check check (kind in ('comment', 'status', 'create'));
alter table public.linear_actions add constraint linear_actions_check check (
  (kind = 'comment' and body is not null and to_state_id is null) or
  (kind = 'status' and body is null and to_state_id is not null) or
  (kind = 'create' and body is not null and team_id is not null and to_state_id is null and issue_id = id::text)
);
-- Replace signatures instead of leaving ambiguous PostgREST overloads.
drop function public.sarjy_propose_action(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text);
drop function public.sarjy_record_action_result(uuid, text, text);

create or replace function public.sarjy_action_json(p_action public.linear_actions)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', p_action.id, 'standupId', p_action.standup_id, 'entryId', p_action.entry_id,
    'sourceText', p_action.source_text, 'issueId', p_action.issue_id,
    'issueIdentifier', p_action.issue_identifier, 'issueTitle', p_action.issue_title,
    'issueUrl', p_action.issue_url, 'teamId', p_action.team_id, 'kind', p_action.kind, 'body', p_action.body,
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
    public.sarjy_action_entry(new.doc, a.entry_id)->>'issueId' is distinct from (case when a.kind = 'create' then null else a.issue_id end)
  );
  return new;
end $$;


create or replace function public.sarjy_propose_action(
  p_visitor_id uuid, p_standup_id uuid, p_action_id uuid, p_entry_id uuid,
  p_issue_id text, p_issue_identifier text, p_issue_title text, p_issue_url text,
  p_kind text, p_body text, p_from_state_id text, p_from_state_name text,
  p_to_state_id text, p_to_state_name text, p_team_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.standups; a public.linear_actions; entry jsonb;
begin
  select * into a from public.linear_actions where id = p_action_id and visitor_id = p_visitor_id and standup_id = p_standup_id;
  if found then return jsonb_build_object('status', 'replayed', 'action', public.sarjy_action_json(a)); end if;
  select * into s from public.standups where id = p_standup_id and visitor_id = p_visitor_id for update;
  if not found or s.status <> 'active' then return jsonb_build_object('status', 'not_found'); end if;
  entry := public.sarjy_action_entry(s.doc, p_entry_id);
  if entry is null or coalesce((entry->>'dropped')::boolean, false) or entry->>'issueId' is distinct from (case when p_kind = 'create' then null else p_issue_id end) then
    return jsonb_build_object('status', 'invalid_entry');
  end if;
  if p_kind is null or p_kind not in ('comment', 'status', 'create') or
     (p_kind = 'create' and (p_issue_id is distinct from p_action_id::text or
       nullif(btrim(p_team_id), '') is null or nullif(btrim(p_issue_title), '') is null or length(p_issue_title) > 200 or
       nullif(btrim(p_body), '') is null or length(p_body) > 500 or p_to_state_id is not null or
       p_from_state_id is not null or p_issue_identifier <> '' or p_issue_url <> '')) or
     (p_kind = 'comment' and (nullif(btrim(p_body), '') is null or length(p_body) > 500 or p_to_state_id is not null)) or
     (p_kind = 'status' and (p_body is not null or nullif(p_to_state_id, '') is null)) then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  insert into public.linear_actions(id, visitor_id, standup_id, entry_id, source_text,
    issue_id, issue_identifier, issue_title, issue_url, kind, body, team_id,
    from_state_id, from_state_name, to_state_id, to_state_name)
  values (p_action_id, p_visitor_id, p_standup_id, p_entry_id, entry->>'text',
    p_issue_id, p_issue_identifier, p_issue_title, p_issue_url, p_kind, p_body, p_team_id,
    p_from_state_id, p_from_state_name, p_to_state_id, p_to_state_name)
  returning * into a;
  return jsonb_build_object('status', 'ok', 'action', public.sarjy_action_json(a));
end $$;

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
     entry->>'text' is distinct from a.source_text or entry->>'issueId' is distinct from (case when a.kind = 'create' then null else a.issue_id end) then
    update public.linear_actions set status = 'invalidated', result = 'The saved update changed. Ask Sarjy for a new proposal.', updated_at = now()
      where id = a.id returning * into a;
    return jsonb_build_object('status', 'invalidated', 'action', public.sarjy_action_json(a));
  end if;
  update public.linear_actions set status = 'applying', updated_at = now() where id = a.id returning * into a;
  return jsonb_build_object('status', 'claimed', 'action', public.sarjy_action_json(a));
end $$;

create or replace function public.sarjy_record_action_result(p_action_id uuid, p_status text, p_result text, p_issue_identifier text default null, p_issue_url text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.linear_actions;
begin
  if p_status not in ('succeeded', 'failed', 'uncertain') then return null; end if;
  update public.linear_actions set status = p_status, result = left(p_result, 500), updated_at = now(),
      issue_identifier = case when kind = 'create' and p_status = 'succeeded' then coalesce(p_issue_identifier, issue_identifier) else issue_identifier end,
      issue_url = case when kind = 'create' and p_status = 'succeeded' then coalesce(p_issue_url, issue_url) else issue_url end
    where id = p_action_id and status in ('applying', 'uncertain') returning * into a;
  if not found then select * into a from public.linear_actions where id = p_action_id; end if;
  return case when a.id is null then null else public.sarjy_action_json(a) end;
end $$;

revoke all on function public.sarjy_propose_action(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text),
  public.sarjy_record_action_result(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.sarjy_propose_action(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text),
  public.sarjy_record_action_result(uuid, text, text, text, text) to service_role;
