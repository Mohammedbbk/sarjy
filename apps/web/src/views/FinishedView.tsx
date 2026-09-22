import { Button } from '../components/Button'
import { Workspace } from '../components/Layout'
import { TicketPanel } from '../components/TicketPanel'
import { Transcript } from '../components/Transcript'
import { MicIcon } from '../components/icons'
import { formatDuration, type Turn } from '../lib/transcript'
import type { WorkflowSnapshot } from '../../shared/workflow'
import { WorkflowPanel } from '../components/WorkflowPanel'

type Props = {
  turns: Turn[]
  duration: number | null // null if the call never connected
  onRestart: () => void
  snapshot?: WorkflowSnapshot
  onFinish?: () => void
  finishing?: boolean
  finishError?: string | null
}

export function FinishedView({ turns, duration, onRestart, snapshot, onFinish, finishing = false, finishError = null }: Props) {
  const saved = snapshot?.stage === 'finished'
  return (
    <Workspace rail={<div className="flex flex-col gap-4">{snapshot && <WorkflowPanel snapshot={snapshot} />}<TicketPanel /></div>}>
      <div className="flex flex-col gap-3">
        <h1 className="text-[34px] leading-tight font-bold tracking-[-0.01em]">
          {saved ? 'Stand-up saved.' : 'Voice call ended.'}
        </h1>
        <p className="text-base text-muted">
          {duration === null ? 'Not connected' : formatDuration(duration)} · {turns.length}{' '}
          {turns.length === 1 ? 'turn' : 'turns'}
        </p>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="transcript-heading">
        <h2 id="transcript-heading" className="text-[15px] font-bold">
          Transcript
        </h2>
        <Transcript turns={turns} placeholder="Nothing was said on this call." />
      </section>

      {snapshot?.summary && <section className="rounded-xl border border-line bg-raised p-5"><h2 className="mb-3 text-[15px] font-bold">Saved recap</h2>{(['progress', 'blockers', 'commitments'] as const).map((key) => <div key={key} className="mb-3"><p className="font-mono text-[11px] tracking-wide text-dim uppercase">{key}</p><p className="text-sm text-soft">{snapshot.summary![key].map((item) => item.text).join(' · ') || 'None'}</p></div>)}</section>}
      {finishError && <p className="text-sm text-red">{finishError}</p>}

      <div className="mt-auto flex flex-wrap gap-3 border-t border-line pt-6">
        {!saved && onFinish && <Button variant="primary" size="lg" onClick={onFinish} disabled={finishing}>{finishing ? 'Saving…' : 'Finish stand-up'}</Button>}
        <Button variant={saved ? 'primary' : 'secondary'} size="lg" onClick={onRestart}>
          <MicIcon />
          {saved ? 'Start voice again' : 'Resume voice'}
        </Button>
      </div>
    </Workspace>
  )
}
