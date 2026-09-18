import { Button } from '../components/Button'
import { Workspace } from '../components/Layout'
import { TicketPanel } from '../components/TicketPanel'
import { Transcript } from '../components/Transcript'
import { MicIcon } from '../components/icons'
import { formatDuration, type Turn } from '../lib/transcript'

type Props = {
  turns: Turn[]
  /** Time on the call, or null if it never connected. */
  duration: number | null
  onRestart: () => void
}

/** Finished: the call is over and the transcript is on screen. */
export function FinishedView({ turns, duration, onRestart }: Props) {
  return (
    <Workspace rail={<TicketPanel />}>
      <div className="flex flex-col gap-3">
        <h1 className="text-[34px] leading-tight font-bold tracking-[-0.01em]">
          Stand-up complete.
        </h1>
        <p className="text-base text-muted">
          {duration === null ? 'Not connected' : formatDuration(duration)} · {turns.length}{' '}
          {turns.length === 1 ? 'turn' : 'turns'}
        </p>
      </div>

      {/*
        A written summary and a "tickets updated" receipt used to live here.
        Both are gone until something real produces them: the agent does not
        summarise the call, and it cannot change a ticket.
      */}

      <section className="flex flex-col gap-4" aria-labelledby="transcript-heading">
        <h2 id="transcript-heading" className="text-[15px] font-bold">
          Transcript
        </h2>
        <Transcript turns={turns} placeholder="Nothing was said on this call." />
      </section>

      <div className="mt-auto flex flex-wrap gap-3 border-t border-line pt-6">
        <Button variant="primary" size="lg" onClick={onRestart}>
          <MicIcon />
          Start another stand-up
        </Button>
      </div>
    </Workspace>
  )
}
