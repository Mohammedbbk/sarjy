import { Button } from '../components/Button'
import { Workspace } from '../components/Layout'
import { TicketPanel } from '../components/TicketPanel'
import { MicIcon } from '../components/icons'

/** Idle: nothing is connected yet, the stand-up has not started. */
export function IdleView({ onStart }: { onStart: () => void }) {
  return (
    <Workspace rail={<TicketPanel />}>
      <div className="flex flex-col gap-3">
        <h1 className="text-[34px] leading-tight font-bold tracking-[-0.01em]">
          Let's plan your day.
        </h1>
        <p className="max-w-115 text-base leading-relaxed text-muted">
          A short spoken check-in on your Linear tickets — progress, blockers, and what's next.
        </p>
      </div>

      {/*
        A "since yesterday" recap belongs here, but it needs a record of the
        last stand-up. Nothing stores one yet, so nothing is claimed.
      */}

      <Button variant="primary" size="lg" onClick={onStart}>
        <MicIcon />
        Start stand-up
      </Button>

      <p className="max-w-115 text-sm leading-relaxed text-dim">
        Sarjy will ask for your microphone when the call starts.
      </p>
    </Workspace>
  )
}
