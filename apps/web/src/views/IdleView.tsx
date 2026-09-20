import { Button } from '../components/Button'
import { Eyebrow, Workspace } from '../components/Layout'
import { TicketPanel } from '../components/TicketPanel'
import { MicIcon } from '../components/icons'

/** Idle: nothing is connected yet, the stand-up has not started. */
export function IdleView({ onStart }: { onStart: () => void }) {
  return (
    <Workspace rail={<TicketPanel />}>
      <div className="flex flex-col gap-3">
        <h1 className="text-[34px] leading-tight font-semibold tracking-[-0.02em]">
          Let's plan your day.
        </h1>
        <p className="max-w-115 text-base leading-relaxed text-muted">
          A short spoken check-in on your Linear tickets — progress, blockers, and what's next.
        </p>
      </div>

      {/* The shape of the call, before it starts. */}
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

      {/*
        A "since yesterday" recap belongs here, but it needs a record of the
        last stand-up. Nothing stores one yet, so nothing is claimed.
      */}

      <div className="flex flex-col gap-2.5">
        <Button variant="primary" size="lg" onClick={onStart}>
          <MicIcon />
          Start stand-up
        </Button>
        <p className="text-[13px] text-dim">
          About 2 minutes — Sarjy will ask for mic access when you start.
        </p>
      </div>
    </Workspace>
  )
}
