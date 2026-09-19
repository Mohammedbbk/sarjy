import type { StandupError } from '../lib/session'
import { Button } from './Button'
import { Eyebrow } from './Layout'

type Props = {
  error: StandupError
  onRetry: () => void
  onDismiss: () => void
  variant: 'blocking' | 'inline'
}

export function ConnectionNotice({ error, onRetry, onDismiss, variant }: Props) {
  const blocking = variant === 'blocking'

  return (
    <section
      role="alert"
      className="flex w-full max-w-120 flex-col gap-2.5 rounded-xl border border-red/35 bg-red/5 px-4.5 py-4"
    >
      <Eyebrow>{blocking ? 'Connection problem' : 'Problem'}</Eyebrow>
      <p className="text-[15px] leading-relaxed font-semibold text-red">{error.message}</p>
      {error.hint && <p className="text-sm leading-relaxed text-soft">{error.hint}</p>}
      {error.detail && <p className="font-mono text-[11px] break-words text-dim">{error.detail}</p>}

      <div className="mt-1 flex flex-wrap gap-2">
        {blocking && (
          <Button variant="primary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button variant="quiet" size="sm" onClick={onDismiss}>
          {blocking ? 'Back' : 'Dismiss'}
        </Button>
      </div>
    </section>
  )
}

export function ConnectingNotice({ label }: { label: string }) {
  return (
    <p className="text-[15px] leading-relaxed text-dim" aria-live="polite">
      {label}
    </p>
  )
}
