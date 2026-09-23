import type { LinearAction, ProposalInput } from '../../shared/actions.js'
import { LinearTargetError, linearWriteGateway, type LinearWriteGateway } from './linear.js'
import { claimAction, readAction, recordAction, saveProposal } from './linear-action-store.js'

type Result = { ok: true; action: LinearAction } | { ok: false; status: number; message: string }
type Outcome = { status: 'succeeded' | 'failed' | 'uncertain'; message: string }
type LinearIssue = Awaited<ReturnType<LinearWriteGateway['issue']>>

const fail = (status: number, message: string): Result => ({ ok: false, status, message })
const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export function parseProposal(raw: Record<string, unknown>): ProposalInput | null {
  const { actionId, entryId, issueId, kind, body, targetStatus } = raw
  if (typeof actionId !== 'string' || !uuid(actionId)) return null
  if (typeof entryId !== 'string' || !uuid(entryId)) return null
  if (typeof issueId !== 'string' || !uuid(issueId)) return null

  if (kind === 'comment' && typeof body === 'string' && targetStatus === undefined) {
    const comment = body.trim()
    if (comment.length > 0 && comment.length <= 500) {
      return { actionId, entryId, issueId, kind, body: comment }
    }
  }

  if (kind === 'status' && typeof targetStatus === 'string' && body === undefined) {
    const status = targetStatus.trim()
    if (status.length > 0 && status.length <= 80) {
      return { actionId, entryId, issueId, kind, targetStatus: status }
    }
  }
  return null
}

export async function proposeAction(
  visitorId: string,
  standupId: string,
  input: ProposalInput,
  gateway: LinearWriteGateway = linearWriteGateway,
): Promise<Result> {
  const previous = await readAction(visitorId, input.actionId)
  if (!previous.ok) return fail(503, 'Could not check the proposal request.')
  if (previous.data) {
    return previous.data.standupId === standupId
      ? { ok: true, action: previous.data }
      : fail(409, 'That proposal ID is already in use.')
  }

  let issue: LinearIssue
  try {
    issue = await gateway.issue(input.issueId)
  } catch (error) {
    return error instanceof LinearTargetError
      ? fail(400, error.message)
      : fail(503, 'Could not check the Linear ticket.')
  }

  const target = input.kind === 'status'
    ? issue.states.find((state) => state.name.toLowerCase() === input.targetStatus!.toLowerCase())
    : undefined
  if (input.kind === 'status' && !target) return fail(400, 'That status is not in the demo team workflow.')
  if (target?.id === issue.stateId) return fail(409, 'The ticket is already in that status.')

  const saved = await saveProposal({
    visitorId,
    standupId,
    actionId: input.actionId,
    entryId: input.entryId,
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    issueTitle: issue.title,
    issueUrl: issue.url,
    kind: input.kind,
    body: input.kind === 'comment' ? input.body! : null,
    fromStateId: input.kind === 'status' ? issue.stateId : null,
    fromStateName: input.kind === 'status' ? issue.stateName : null,
    toStateId: target?.id ?? null,
    toStateName: target?.name ?? null,
  })
  if (!saved.ok) return fail(503, 'Could not save the proposal.')
  if ((saved.data.status === 'ok' || saved.data.status === 'replayed') && saved.data.action) {
    return { ok: true, action: saved.data.action }
  }
  return fail(saved.data.status === 'not_found' ? 404 : 409, 'That saved update is no longer available for a proposal.')
}

async function reconcile(action: LinearAction, gateway: LinearWriteGateway): Promise<Outcome> {
  try {
    if (action.kind === 'comment') {
      const comment = await gateway.comment(action.id)
      return comment?.issueId === action.issueId && comment.body === action.body
        ? { status: 'succeeded', message: 'Comment verified in Linear.' }
        : { status: 'uncertain', message: 'The comment could not be verified in Linear.' }
    }
    const issue = await gateway.issue(action.issueId)
    return issue.stateId === action.toStateId
      ? { status: 'succeeded', message: 'Ticket status verified in Linear.' }
      : { status: 'uncertain', message: 'The ticket is not in the proposed status. Check Linear before trying again.' }
  } catch {
    return { status: 'uncertain', message: 'Could not verify the outcome in Linear.' }
  }
}

async function execute(action: LinearAction, gateway: LinearWriteGateway): Promise<Outcome> {
  let issue: LinearIssue
  try {
    issue = await gateway.issue(action.issueId)
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof LinearTargetError ? error.message : 'Could not check the Linear ticket.',
    }
  }

  if (action.kind === 'status') {
    if (issue.stateId !== action.fromStateId) {
      return { status: 'failed', message: 'The ticket status changed since this proposal. Ask Sarjy for a new one.' }
    }
    if (!issue.states.some((state) => state.id === action.toStateId)) {
      return { status: 'failed', message: 'The proposed status is no longer available.' }
    }
  }

  try {
    const accepted = action.kind === 'comment'
      ? await gateway.createComment(action.id, action.issueId, action.body!)
      : await gateway.updateStatus(action.issueId, action.toStateId!)
    if (!accepted) return { status: 'failed', message: 'Linear rejected this change.' }
  } catch {
    // A lost response does not tell us whether Linear applied the change.
    return reconcile(action, gateway)
  }
  return reconcile(action, gateway)
}

async function persist(action: LinearAction, outcome: Outcome): Promise<Result> {
  const recorded = await recordAction(action.id, outcome.status, outcome.message)
  return recorded.ok && recorded.data ? { ok: true, action: recorded.data } : fail(503, 'The Linear outcome could not be saved. Check Linear before trying again.')
}

export async function confirmAction(
  visitorId: string,
  actionId: string,
  gateway: LinearWriteGateway = linearWriteGateway,
): Promise<Result> {
  const claimed = await claimAction(visitorId, actionId)
  if (!claimed.ok) return fail(503, 'Could not claim the proposal.')
  if (!claimed.data.action) return fail(404, 'Proposal not found.')
  if (claimed.data.status !== 'claimed') return { ok: true, action: claimed.data.action }
  return persist(claimed.data.action, await execute(claimed.data.action, gateway))
}

export async function checkAction(
  visitorId: string,
  actionId: string,
  gateway: LinearWriteGateway = linearWriteGateway,
): Promise<Result> {
  const loaded = await readAction(visitorId, actionId)
  if (!loaded.ok) return fail(503, 'Could not load the proposal.')
  if (!loaded.data) return fail(404, 'Proposal not found.')
  if (loaded.data.status !== 'applying' && loaded.data.status !== 'uncertain') return { ok: true, action: loaded.data }
  return persist(loaded.data, await reconcile(loaded.data, gateway))
}
