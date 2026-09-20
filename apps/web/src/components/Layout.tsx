import type { ReactNode } from 'react'

/**
 * Product header: wordmark, the demo badge, and one (i) that explains the demo
 * on hover or focus. The explanation used to be a permanent footer bar.
 */
export function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-5 sm:px-8">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <line x1="6" y1="9" x2="6" y2="15" />
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="18" y1="8" x2="18" y2="16" />
        </svg>
        <span className="text-[15px] font-semibold tracking-[-0.01em]">Sarjy</span>
        <span className="inline-flex items-center rounded-[5px] border border-line bg-raised px-2.5 py-1 font-mono text-[11px] font-medium tracking-[0.05em] text-muted uppercase">
          Demo workspace
        </span>
        <DemoInfo />
      </div>
    </header>
  )
}

/** The demo caveats, out of the way until someone asks for them. */
function DemoInfo() {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="About this demo workspace"
        aria-describedby="demo-info"
        className="inline-flex size-[18px] items-center justify-center rounded-full border border-line-strong text-dim hover:text-muted"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="7.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <span
        id="demo-info"
        role="tooltip"
        className="pointer-events-none absolute top-[26px] left-0 z-20 w-[270px] rounded-lg border border-line-strong bg-raised px-3.5 py-3 text-[12.5px] leading-relaxed text-muted opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.5)] group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      >
        Demo workspace — memory and Linear tickets are shared with everyone who opens this. The
        voice call, transcript and tickets are live, and Sarjy only changes a ticket after you
        confirm it out loud.
      </span>
    </span>
  )
}

/** Two-column workspace: conversation on the left, ticket rail on the right. */
export function Workspace({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col lg:flex-row">
      <main className="flex min-w-0 flex-1 flex-col px-5 py-10 sm:px-10 lg:px-16 lg:py-14">
        <div className="flex w-full max-w-[600px] flex-1 flex-col gap-7">{children}</div>
      </main>
      <aside className="w-full shrink-0 border-t border-line px-5 py-8 sm:px-10 lg:w-[380px] lg:border-t-0 lg:border-s lg:px-8 lg:py-10">
        {rail}
      </aside>
    </div>
  )
}

/** Uppercase mono eyebrow used above panels and transcript turns. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[11px] font-medium tracking-[0.05em] text-dim uppercase">
      {children}
    </span>
  )
}
