import type { LinearAction } from '../../shared/actions.js'
import { rpc, type DbResult } from './db.js'

type ProposalRow = { status: 'ok' | 'replayed' | 'not_found' | 'invalid_entry' | 'invalid_input'; action?: LinearAction }
type ClaimRow = { status: 'claimed' | 'not_found' | LinearAction['status']; action?: LinearAction }
type ProposalToSave = {
  visitorId: string
  standupId: string
  actionId: string
  entryId: string
  issueId: string
  teamId: string | null
  issueIdentifier: string
  issueTitle: string
  issueUrl: string
  kind: LinearAction['kind']
  body: string | null
  fromStateId: string | null
  fromStateName: string | null
  toStateId: string | null
  toStateName: string | null
}

export function listActions(visitorId: string, standupId: string | null): Promise<DbResult<LinearAction[]>> {
  return rpc('sarjy_list_actions', { p_visitor_id: visitorId, p_standup_id: standupId })
}

export function readAction(visitorId: string, actionId: string): Promise<DbResult<LinearAction | null>> {
  return rpc('sarjy_read_action', { p_visitor_id: visitorId, p_action_id: actionId })
}

export function saveProposal(input: ProposalToSave): Promise<DbResult<ProposalRow>> {
  return rpc('sarjy_propose_action', {
    p_visitor_id: input.visitorId,
    p_standup_id: input.standupId,
    p_action_id: input.actionId,
    p_entry_id: input.entryId,
    p_issue_id: input.issueId,
    p_team_id: input.teamId,
    p_issue_identifier: input.issueIdentifier,
    p_issue_title: input.issueTitle,
    p_issue_url: input.issueUrl,
    p_kind: input.kind,
    p_body: input.body,
    p_from_state_id: input.fromStateId,
    p_from_state_name: input.fromStateName,
    p_to_state_id: input.toStateId,
    p_to_state_name: input.toStateName,
  })
}

export function claimAction(visitorId: string, actionId: string): Promise<DbResult<ClaimRow>> {
  return rpc('sarjy_claim_action', { p_visitor_id: visitorId, p_action_id: actionId })
}

export function recordAction(actionId: string, status: 'succeeded' | 'failed' | 'uncertain', result: string, receipt?: { identifier: string; url: string }): Promise<DbResult<LinearAction | null>> {
  return rpc('sarjy_record_action_result', { p_action_id: actionId, p_status: status, p_result: result, p_issue_identifier: receipt?.identifier ?? null, p_issue_url: receipt?.url ?? null })
}
