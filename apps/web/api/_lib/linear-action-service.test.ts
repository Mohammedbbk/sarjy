import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LinearAction } from '../../shared/actions.js'
import type { LinearWriteGateway } from './linear.js'

vi.mock('./linear-action-store.js', () => ({
  claimAction: vi.fn(), readAction: vi.fn(), recordAction: vi.fn(), saveProposal: vi.fn(),
}))

import { checkAction, confirmAction, parseProposal } from './linear-action-service.js'
import { claimAction, readAction, recordAction } from './linear-action-store.js'

const action: LinearAction = {
  id: '11111111-1111-4111-8111-111111111111', standupId: 'standup', entryId: 'entry',
  sourceText: 'Shipped referral', issueId: 'issue', issueIdentifier: 'SAR-1', issueTitle: 'Referral',
  issueUrl: 'https://linear.app/example', kind: 'comment', body: 'Shipped referral',
  fromStateId: null, fromStateName: null, toStateId: null, toStateName: null,
  status: 'applying', result: null, createdAt: '', updatedAt: '',
}

function gateway(overrides: Partial<LinearWriteGateway> = {}): LinearWriteGateway {
  return {
    issue: vi.fn().mockResolvedValue({ id: 'issue', identifier: 'SAR-1', title: 'Referral', url: action.issueUrl,
      stateId: 'todo', stateName: 'Todo', states: [{ id: 'todo', name: 'Todo' }, { id: 'done', name: 'Done' }] }),
    comment: vi.fn().mockResolvedValue({ issueId: 'issue', body: 'Shipped referral' }),
    createComment: vi.fn().mockResolvedValue(true),
    updateStatus: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(claimAction).mockReset().mockResolvedValue({ ok: true, data: { status: 'claimed', action } })
  vi.mocked(readAction).mockReset()
  vi.mocked(recordAction).mockReset().mockImplementation(async (_id, status, result) => ({ ok: true, data: { ...action, status, result } }))
})

describe('approved Linear execution', () => {
  it('only accepts one bounded action shape', () => {
    const base = { actionId: action.id, entryId: action.id, issueId: action.id }
    expect(parseProposal({ ...base, kind: 'comment', body: 'Ship it' })).toMatchObject({ kind: 'comment', body: 'Ship it' })
    expect(parseProposal({ ...base, kind: 'comment', body: 'Ship it', targetStatus: 'Done' })).toBeNull()
    expect(parseProposal({ ...base, kind: 'status', targetStatus: 'Done', body: 'extra' })).toBeNull()
  })

  it('posts a comment with the action id and verifies its exact issue and body', async () => {
    const linear = gateway()
    const result = await confirmAction('visitor', action.id, linear)
    expect(linear.createComment).toHaveBeenCalledWith(action.id, action.issueId, action.body)
    expect(result).toMatchObject({ ok: true, action: { status: 'succeeded' } })
  })

  it('returns the existing claim on a repeated approval without calling Linear again', async () => {
    vi.mocked(claimAction).mockResolvedValue({ ok: true, data: { status: 'applying', action } })
    const linear = gateway()
    expect(await confirmAction('visitor', action.id, linear)).toMatchObject({ ok: true, action: { status: 'applying' } })
    expect(linear.createComment).not.toHaveBeenCalled()
    expect(linear.updateStatus).not.toHaveBeenCalled()
  })

  it('reconciles a lost comment response without sending a second comment', async () => {
    const linear = gateway({ createComment: vi.fn().mockRejectedValue(new Error('lost response')) })
    expect(await confirmAction('visitor', action.id, linear)).toMatchObject({ ok: true, action: { status: 'succeeded' } })
    expect(linear.createComment).toHaveBeenCalledTimes(1)
  })

  it('does not accept a comment receipt attached to another ticket', async () => {
    const linear = gateway({ comment: vi.fn().mockResolvedValue({ issueId: 'other-issue', body: action.body }) })
    expect(await confirmAction('visitor', action.id, linear)).toMatchObject({ ok: true, action: { status: 'uncertain' } })
  })

  it('records an uncertain result when a lost response cannot be verified', async () => {
    const linear = gateway({ createComment: vi.fn().mockRejectedValue(new Error('lost response')),
      comment: vi.fn().mockRejectedValue(new Error('lookup unavailable')) })
    expect(await confirmAction('visitor', action.id, linear)).toMatchObject({ ok: true, action: { status: 'uncertain' } })
    expect(linear.createComment).toHaveBeenCalledTimes(1)
  })

  it('can verify an uncertain comment later without posting again', async () => {
    vi.mocked(readAction).mockResolvedValue({ ok: true, data: { ...action, status: 'uncertain' } })
    const linear = gateway()
    expect(await checkAction('visitor', action.id, linear)).toMatchObject({ ok: true, action: { status: 'succeeded' } })
    expect(linear.createComment).not.toHaveBeenCalled()
  })

  it('refuses a status proposal if another visitor changed the ticket first', async () => {
    const statusAction: LinearAction = { ...action, kind: 'status', body: null, fromStateId: 'todo', fromStateName: 'Todo', toStateId: 'done', toStateName: 'Done' }
    vi.mocked(claimAction).mockResolvedValue({ ok: true, data: { status: 'claimed', action: statusAction } })
    const linear = gateway({ issue: vi.fn().mockResolvedValue({ id: 'issue', stateId: 'blocked', states: [{ id: 'done', name: 'Done' }] }) })
    expect(await confirmAction('visitor', action.id, linear)).toMatchObject({ ok: true, action: { status: 'failed' } })
    expect(linear.updateStatus).not.toHaveBeenCalled()
  })

  it('verifies the target state after a status mutation', async () => {
    const statusAction: LinearAction = { ...action, kind: 'status', body: null, fromStateId: 'todo', fromStateName: 'Todo', toStateId: 'done', toStateName: 'Done' }
    vi.mocked(claimAction).mockResolvedValue({ ok: true, data: { status: 'claimed', action: statusAction } })
    const issue = vi.fn()
      .mockResolvedValueOnce({ id: 'issue', stateId: 'todo', states: [{ id: 'done', name: 'Done' }] })
      .mockResolvedValueOnce({ id: 'issue', stateId: 'done', states: [{ id: 'done', name: 'Done' }] })
    const linear = gateway({ issue })
    expect(await confirmAction('visitor', action.id, linear)).toMatchObject({ ok: true, action: { status: 'succeeded' } })
    expect(linear.updateStatus).toHaveBeenCalledWith(action.issueId, 'done')
  })
})
