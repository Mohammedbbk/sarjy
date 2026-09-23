import { Button } from '../components/Button'
import { Eyebrow, Workspace } from '../components/Layout'
import { TicketPanel } from '../components/TicketPanel'
import { MicIcon } from '../components/icons'
import { WorkflowPanel } from '../components/WorkflowPanel'
import { ProposalPanel } from '../components/ProposalPanel'
import type { useActions } from '../lib/actions'
import type { StandupSummary, WorkflowSnapshot } from '../../shared/workflow'

export function IdleView({ onStart, snapshot, resumed = false, lastSummary = null, actions }: { onStart: () => void; snapshot?: WorkflowSnapshot; resumed?: boolean; lastSummary?: StandupSummary | null; actions: ReturnType<typeof useActions> }) {
  return (
    <Workspace rail={<TicketPanel />}>
      <div className="flex flex-col gap-3">
        <h1 className="text-[34px] leading-tight font-semibold tracking-[-0.02em]">
          Let's plan your day.
        </h1>
        <p className="max-w-115 text-base leading-relaxed text-muted">
          A short spoken check-in on your Linear tickets: progress, blockers, and what's next.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Eyebrow>What we'll cover</Eyebrow>
        <p className="flex items-center gap-2 font-mono text-xs tracking-[0.08em] text-dim uppercase">
          <span>Review</span>
          <span aria-hidden="true" className="opacity-50">
            ·
          </span>
          <span>Blockers</span>
          <span aria-hidden="true" className="opacity-50">
            ·
          </span>
          <span>Today</span>
          <span aria-hidden="true" className="opacity-50">
            ·
          </span>
          <span>Confirm</span>
        </p>
      </div>

      {snapshot && resumed && snapshot.revision > 0 && <WorkflowPanel snapshot={snapshot} />}
      <ProposalPanel actions={actions.actions} pendingId={actions.pendingId} error={actions.actionError ?? actions.loadError} onApply={actions.apply} onCheck={actions.check} />
      {lastSummary && <section className="rounded-xl border border-line p-4"><Eyebrow>Since last time</Eyebrow><p className="mt-2 text-sm text-soft">{lastSummary.commitments.map((item) => item.text).join(' · ') || 'No commitment was saved.'}</p></section>}

      <div className="flex flex-col gap-2.5">
        <Button variant="primary" size="lg" onClick={onStart}>
          <MicIcon />
          {resumed && snapshot && snapshot.revision > 0 ? 'Resume stand-up' : 'Start stand-up'}
        </Button>
        <p className="text-[13px] text-dim">
          About 2 minutes. Sarjy will ask for mic access when you start.
        </p>
      </div>
    </Workspace>
  )
}
