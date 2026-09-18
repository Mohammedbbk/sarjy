import { DotsIcon, MicIcon, MicOffIcon, WaveIcon } from './icons'

export type AudioState = 'connecting' | 'listening' | 'speaking' | 'thinking' | 'muted'

const content: Record<AudioState, { label: string; Icon: typeof MicIcon }> = {
  connecting: { label: 'Connecting', Icon: DotsIcon },
  listening: { label: 'Listening', Icon: MicIcon },
  speaking: { label: 'Speaking', Icon: WaveIcon },
  thinking: { label: 'Thinking', Icon: DotsIcon },
  muted: { label: 'Mic muted', Icon: MicOffIcon },
}

/** Mic/voice state pill, driven by the LiveKit connection and agent state. */
export function AudioStatus({ state }: { state: AudioState }) {
  const { label, Icon } = content[state]
  const quiet = state === 'muted' || state === 'connecting'

  return (
    <p
      className="inline-flex w-fit items-center gap-2.5 rounded-lg border border-line bg-raised px-3.5 py-2.5"
      aria-live="polite"
    >
      <span
        className={`flex size-[22px] shrink-0 items-center justify-center rounded-md ${
          quiet ? 'bg-line text-muted' : 'bg-accent-soft text-accent'
        }`}
      >
        <Icon size={14} />
      </span>
      <span className="text-[13px] font-semibold">{label}</span>
    </p>
  )
}
