/**
 * Standing disclaimer.
 *
 * The call and the ticket list are both real. Ticket changes are not: there is
 * no write path anywhere in this app. This footer draws that line.
 */
export function DemoFooter() {
  return (
    <footer className="border-t border-line px-5 py-3 sm:px-8">
      <p className="text-xs leading-relaxed text-dim">
        <span className="font-mono tracking-[0.05em] text-muted uppercase">Demo workspace</span> —
        the voice call, transcript, agent status and Linear tickets are live. Tickets are read-only:
        no ticket, summary or integration is updated by this stand-up.
      </p>
    </footer>
  )
}
