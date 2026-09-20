import type { useAgent } from '@livekit/components-react'
import { DotsIcon, MicIcon, MicOffIcon, WaveIcon } from './icons'

export type AudioState = 'connecting' | 'listening' | 'speaking' | 'thinking' | 'muted'

function toAudioState(
  agentState: ReturnType<typeof useAgent>['state'],
  microphoneEnabled: boolean,
  connected: boolean,
): AudioState {
  if (connected && !microphoneEnabled) return 'muted'
  switch (agentState) {
    case 'listening':
    case 'thinking':
    case 'speaking':
      return agentState
    default:
      return 'connecting'
  }
}

const content: Record<AudioState, { label: string; Icon: typeof MicIcon }> = {
  connecting: { label: 'Connecting', Icon: DotsIcon },
  listening: { label: 'Listening', Icon: MicIcon },
  speaking: { label: 'Speaking', Icon: WaveIcon },
  thinking: { label: 'Thinking', Icon: DotsIcon },
  muted: { label: 'Mic muted', Icon: MicOffIcon },
}

export function AudioStatus({ agentState, microphoneEnabled, connected }: {
  agentState: ReturnType<typeof useAgent>['state']
  microphoneEnabled: boolean
  connected: boolean
}) {
  const state = toAudioState(agentState, microphoneEnabled, connected)
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
