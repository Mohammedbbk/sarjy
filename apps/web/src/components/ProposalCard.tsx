import type { Proposal } from '../lib/parked'
import { Button } from './Button'
import { CheckIcon } from './icons'

/**
 * Parked: not mounted anywhere.
 *
 * Sarjy cannot change a ticket — there is no Linear integration — so a card
 * proposing a change, and the receipt that follows it, would both be fiction.
 * Kept for when ticket updates are real.
 */

export type ProposalStatus = 'pending' | 'confirmed' | 'dismissed'

type Props = {
  proposal: Proposal
  status: ProposalStatus
  onConfirm: () => void
  onDismiss: () => void
}

/** A ticket change Sarjy suggests. It is never applied until it is confirmed. */
export function ProposalCard({ proposal, status, onConfirm, onDismiss }: Props) {
  if (status === 'confirmed') {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-green/30 bg-green/10 px-3.5 py-3 text-[13px] font-semibold text-green">
        <CheckIcon size={16} />
        {proposal.ticketId} moved to {proposal.nextStatus}
      </p>
    )
  }

  if (status === 'dismissed') {
    return (
      <p className="rounded-xl border border-line bg-raised px-3.5 py-3 text-[13px] text-dim">
        Proposal for {proposal.ticketId} dismissed
      </p>
    )
  }

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="proposal-heading">
      <h2
        id="proposal-heading"
        className="inline-flex w-fit rounded-md bg-accent-soft px-2.5 py-1 text-[11px] font-bold tracking-[0.05em] text-accent uppercase"
      >
        Proposed — not applied
      </h2>
      <div className="flex flex-col gap-2.5 rounded-xl border border-line-strong bg-raised p-4">
        <span className="font-mono text-xs text-dim">
          {proposal.ticketId} · {proposal.ticketTitle}
        </span>
        <p className="text-sm">{proposal.change}</p>
        <div className="mt-0.5 flex gap-2">
          <Button variant="primary" size="sm" onClick={onConfirm}>
            Confirm
          </Button>
          <Button variant="quiet" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </section>
  )
}
