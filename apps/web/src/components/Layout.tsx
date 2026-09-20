import type { ReactNode } from 'react'

/** Product header: logo, wordmark and the demo-workspace badge. */
export function Header({ children }: { children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 sm:px-8 sm:py-0 sm:h-16">
      <span
        className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-accent text-[12px] font-extrabold text-bg"
        aria-hidden="true"
      >
        S
      </span>
      <span className="text-[15px] font-bold tracking-[-0.01em]">Sarjy</span>
      <span className="inline-flex items-center rounded-md border border-line bg-raised px-2.5 py-1 text-[11px] font-semibold tracking-[0.05em] text-muted uppercase">
        Demo workspace
      </span>
      <span className="text-[11px] text-muted">
        Shared demo — memory is shared across all visitors.
      </span>
      {children ? <div className="ms-auto">{children}</div> : null}
    </header>
  )
}

/** Two-column workspace: conversation on the left, ticket rail on the right. */
export function Workspace({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <main className="flex min-w-0 flex-1 flex-col px-5 py-10 sm:px-10 lg:px-16 lg:py-14">
        <div className="flex w-full max-w-[640px] flex-1 flex-col gap-7">{children}</div>
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
