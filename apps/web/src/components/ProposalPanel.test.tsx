// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LinearAction } from '../../shared/actions'
import { ProposalPanel } from './ProposalPanel'

const action: LinearAction = {
  id: 'action-1', standupId: 'standup-1', entryId: 'entry-1', sourceText: 'Finished referral',
  issueId: 'issue-1', issueIdentifier: 'SAR-1', issueTitle: 'Referral', issueUrl: 'https://linear.app/example',
  kind: 'comment', body: 'Ready for review', fromStateId: null, fromStateName: null,
  toStateId: null, toStateName: null, status: 'proposed', result: null, createdAt: '', updatedAt: '',
}

afterEach(cleanup)

describe('Linear proposal review', () => {
  it('shows the exact comment and applies only after the visitor clicks', () => {
    const apply = vi.fn()
    render(<ProposalPanel actions={[action]} onApply={apply} onCheck={vi.fn()} />)
    expect(screen.getByText('Post comment: “Ready for review”')).toBeTruthy()
    expect(apply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Linear' }))
    expect(apply).toHaveBeenCalledWith(action.id)
  })

  it('does not offer approval for an outdated proposal', () => {
    render(<ProposalPanel actions={[{ ...action, status: 'invalidated' }]} onApply={vi.fn()} onCheck={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Apply to Linear' })).toBeNull()
    expect(screen.getByText('Outdated')).toBeTruthy()
  })
})
