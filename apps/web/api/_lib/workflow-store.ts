import { randomUUID } from 'node:crypto'
import { emptyStandupDoc, SECTIONS, isCovered, type StandupSummary, type WorkflowCommand, type WorkflowFailure, type WorkflowResult, type WorkflowSnapshot } from '../../shared/workflow.js'
import { rpc, type DbResult } from './db.js'
import { applyCommand, buildSummary } from './workflow.js'

const failure = (error: WorkflowFailure['error'], message: string, snapshot?: WorkflowSnapshot): WorkflowFailure => ({ ok: false, error, message, ...(snapshot ? { snapshot } : {}) })
const fromDb = (result: Extract<DbResult<never>, { ok: false }>) => failure('storage_unavailable', result.message)
const staleMessage = 'The stand-up changed. The latest saved state is shown.'

export async function openStandup(visitorId: string): Promise<{ ok: true; snapshot: WorkflowSnapshot; resumed: boolean } | WorkflowFailure> {
  const result = await rpc<{ status: 'ok'; resumed: boolean; snapshot: WorkflowSnapshot }>('sarjy_open_standup', { p_visitor_id: visitorId, p_empty_doc: emptyStandupDoc() })
  return result.ok ? { ok: true, snapshot: result.data.snapshot, resumed: result.data.resumed } : fromDb(result)
}
export async function readSnapshot(visitorId: string, standupId: string): Promise<WorkflowResult> {
  const result = await rpc<WorkflowSnapshot | null>('sarjy_read_standup', { p_visitor_id: visitorId, p_standup_id: standupId })
  if (!result.ok) return fromDb(result)
  return result.data ? { ok: true, snapshot: result.data } : failure('not_found', 'That stand-up does not exist here.')
}
export function readLastSummary(visitorId: string): Promise<DbResult<StandupSummary | null>> {
  return rpc('sarjy_last_summary', { p_visitor_id: visitorId })
}

type CommitResponse = { status: 'ok' | 'replayed' | 'stale' | 'finished' | 'not_found'; snapshot?: WorkflowSnapshot }
export async function runCommand(input: { visitorId: string; standupId: string; expectedRevision: number; requestId: string; command: WorkflowCommand }): Promise<WorkflowResult> {
  const current = await readSnapshot(input.visitorId, input.standupId)
  if (!current.ok) return current
  if (current.snapshot.revision !== input.expectedRevision) {
    const replay = await rpc<{ snapshot: WorkflowSnapshot } | null>('sarjy_recorded_command', { p_visitor_id: input.visitorId, p_standup_id: input.standupId, p_request_id: input.requestId })
    if (!replay.ok) return fromDb(replay)
    return replay.data ? { ok: true, snapshot: replay.data.snapshot } : failure('stale_revision', staleMessage, current.snapshot)
  }
  const changed = applyCommand(current.snapshot, input.command, randomUUID)
  if (!changed.ok) return failure(changed.error, changed.message, current.snapshot)
  const result = await rpc<CommitResponse>('sarjy_commit_command', {
    p_visitor_id: input.visitorId,
    p_standup_id: input.standupId,
    p_expected_revision: input.expectedRevision,
    p_request_id: input.requestId,
    p_stage: changed.plan.stage,
    p_doc: changed.plan.doc,
  })
  if (!result.ok) return fromDb(result)
  if ((result.data.status === 'ok' || result.data.status === 'replayed') && result.data.snapshot) return { ok: true, snapshot: result.data.snapshot }
  if (result.data.status === 'stale' && result.data.snapshot) return failure('stale_revision', staleMessage, result.data.snapshot)
  if (result.data.status === 'finished' && result.data.snapshot) return failure('invalid_transition', 'This stand-up is already finished.', result.data.snapshot)
  return failure('not_found', 'That stand-up does not exist here.')
}

type FinishResponse = { status: 'ok' | 'replayed' | 'stale' | 'incomplete' | 'unresolved_reference' | 'not_found'; snapshot?: WorkflowSnapshot }
export async function finishStandup(input: { visitorId: string; standupId: string; expectedRevision: number; requestId: string }): Promise<WorkflowResult> {
  const current = await readSnapshot(input.visitorId, input.standupId)
  if (!current.ok) return current
  if (SECTIONS.some((section) => !isCovered(current.snapshot.doc.coverage[section]))) return failure('invalid_transition', 'Cover progress, blockers and today first, or skip them explicitly.', current.snapshot)
  if (current.snapshot.doc.unresolvedReferences.length) return failure('unresolved_reference', 'Resolve the pending ticket clarification first.', current.snapshot)
  const result = await rpc<FinishResponse>('sarjy_finish_standup', {
    p_visitor_id: input.visitorId,
    p_standup_id: input.standupId,
    p_expected_revision: input.expectedRevision,
    p_request_id: input.requestId,
    p_summary: buildSummary(current.snapshot.doc, new Date().toISOString()),
  })
  if (!result.ok) return fromDb(result)
  if ((result.data.status === 'ok' || result.data.status === 'replayed') && result.data.snapshot) return { ok: true, snapshot: result.data.snapshot }
  if (result.data.status === 'stale' && result.data.snapshot) return failure('stale_revision', staleMessage, result.data.snapshot)
  if (result.data.status === 'incomplete' && result.data.snapshot) return failure('invalid_transition', 'Cover progress, blockers and today first, or skip them explicitly.', result.data.snapshot)
  if (result.data.status === 'unresolved_reference' && result.data.snapshot) return failure('unresolved_reference', 'Resolve the pending ticket clarification first.', result.data.snapshot)
  return failure('not_found', 'That stand-up does not exist here.')
}
