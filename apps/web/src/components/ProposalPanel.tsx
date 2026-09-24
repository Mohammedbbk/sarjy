import type { LinearAction } from '../../shared/actions'
import { Button } from './Button'

type Props = {
  actions: LinearAction[]
  pendingId?: string
  error?: string | null
  onApply: (id: string) => void
  onCheck: (id: string) => void
}

const labels: Record<LinearAction['status'], string> = {
  proposed: 'Proposed', applying: 'Applying', succeeded: 'Applied',
  failed: 'Failed', uncertain: 'Outcome uncertain', invalidated: 'Outdated',
}

export function ProposalPanel({ actions, pendingId, error, onApply, onCheck }: Props) {
  return (
    <section className="min-w-0" aria-label="Linear changes to review">
      <h2 className="text-[15px] font-semibold">Linear activity</h2>
      <p className="mt-1 text-xs text-muted">This is a shared demo board. Each change needs your approval.</p>
      {!actions.length && !error && <p className="mt-4 rounded-xl border border-dashed border-line-strong p-5 text-sm leading-relaxed text-muted">No actions yet. Proposed ticket changes and their results will appear here.</p>}
      <div className="mt-4 flex flex-col gap-3">
        {actions.map((action) => (
          <article key={action.id} className="rounded-xl border border-line-strong bg-raised p-4 [overflow-wrap:anywhere]">
            <div className="flex flex-col items-start gap-2">
              {action.issueUrl ? <a className="text-sm font-semibold text-text underline underline-offset-2" href={action.issueUrl} target="_blank" rel="noreferrer">
                {action.issueIdentifier} · {action.issueTitle}
              </a> : <span className="text-sm font-semibold text-text">New ticket · {action.issueTitle}</span>}
              <span className="rounded border border-line-strong px-2 py-0.5 font-mono text-[11px] text-muted" role="status">{labels[action.status]}</span>
            </div>
            <p className="mt-3 text-sm text-soft">
              {action.kind === 'create' ? `Create ticket: “${action.body}”` : action.kind === 'comment' ? `Post comment: “${action.body}”` : `Change status: ${action.fromStateName} → ${action.toStateName}`}
            </p>
            {action.result && <p className="mt-2 text-xs text-muted">{action.result}</p>}
            {action.status === 'proposed' && <Button className="mt-4" size="sm" variant="primary" disabled={pendingId === action.id} onClick={() => onApply(action.id)}>{pendingId === action.id ? 'Applying…' : 'Apply to Linear'}</Button>}
            {(action.status === 'uncertain' || action.status === 'applying') && <Button className="mt-4" size="sm" disabled={pendingId === action.id} onClick={() => onCheck(action.id)}>{pendingId === action.id ? 'Checking…' : 'Check outcome'}</Button>}
          </article>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red" role="alert">{error}</p>}
    </section>
  )
}
