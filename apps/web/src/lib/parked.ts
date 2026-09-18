/**
 * Parked UI scaffolding.
 *
 * `StageTrack` and `ProposalCard` render these, but nothing mounts them: the
 * agent reports no workflow position and cannot change a ticket.
 */

export type Stage = 'review' | 'blockers' | 'today' | 'confirm'

export const STAGES: { key: Stage; label: string }[] = [
  { key: 'review', label: 'Review' },
  { key: 'blockers', label: 'Blockers' },
  { key: 'today', label: 'Today' },
  { key: 'confirm', label: 'Confirm' },
]

/** A ticket change Sarjy would suggest. Never applied: there is no write path. */
export type Proposal = {
  ticketId: string
  ticketTitle: string
  change: string
  /** Free-form: Linear workflow state names are configured per workspace. */
  nextStatus: string
}
