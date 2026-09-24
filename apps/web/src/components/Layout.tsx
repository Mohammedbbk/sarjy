import type { ReactNode } from 'react'

export function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-5 sm:px-8">
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
        className="pointer-events-none fixed top-14 left-5 z-20 w-[min(270px,calc(100vw-40px))] sm:absolute sm:top-[26px] sm:left-0 rounded-lg border border-line-strong bg-raised px-3.5 py-3 text-[12.5px] leading-relaxed text-muted opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.5)] group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      >
        Linear tickets come from a shared demo board. Changes reach Linear only after you apply a
        reviewed proposal. Your stand-up and preferences stay scoped to this browser for 30 days.
      </span>
    </span>
  )
}

export function Workspace({ children, actions, rail }: { children: ReactNode; actions: ReactNode; rail: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <main aria-label="Chat" className="flex min-w-0 flex-col px-5 py-7 sm:px-8 lg:py-9">
        <div className="mb-7 border-b border-line pb-4"><Eyebrow>01 / Chat</Eyebrow></div>
        <div className="flex flex-1 flex-col gap-7">{children}</div>
      </main>
      <aside aria-label="Actions" className="min-w-0 border-t border-line px-5 py-7 sm:px-8 lg:border-t-0 lg:border-s lg:px-6 lg:py-9">
        <div className="mb-7 border-b border-line pb-4"><Eyebrow>02 / Actions</Eyebrow></div>
        <div className="flex flex-col gap-6">{actions}</div>
      </aside>
      <aside aria-label="To-dos" className="min-w-0 border-t border-line px-5 py-7 sm:px-8 lg:border-t-0 lg:border-s lg:px-6 lg:py-9">
        <div className="mb-7 border-b border-line pb-4"><Eyebrow>03 / To-dos</Eyebrow></div>
        {rail}
      </aside>
    </div>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[11px] font-medium tracking-[0.05em] text-dim uppercase">
      {children}
    </span>
  )
}
