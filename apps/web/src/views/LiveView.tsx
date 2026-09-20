import { useAgent, useAudioPlayback, useSessionContext, useTrackToggle } from '@livekit/components-react'
import { useEffect, useState } from 'react'
import { ConnectionState, RoomEvent, Track } from 'livekit-client'
import { AudioStatus } from '../components/AudioStatus'
import { Button } from '../components/Button'
import { ConnectingNotice, ConnectionNotice } from '../components/ConnectionNotice'
import { Workspace } from '../components/Layout'
import { TicketPanel } from '../components/TicketPanel'
import { Transcript } from '../components/Transcript'
import { CloseIcon, MicIcon, MicOffIcon } from '../components/icons'
import type { useStandup } from '../lib/useStandup'
import { describeStartError, type StandupError } from '../lib/session'

type Props = {
  standup: ReturnType<typeof useStandup>
}

function connectingLabel(agentState: string): string {
  switch (agentState) {
    case 'connecting':
      return 'Connecting to the stand-up room…'
    case 'pre-connect-buffering':
      return 'Connected — go ahead, Sarjy is still joining.'
    case 'initializing':
      return 'Sarjy is joining…'
    default:
      return 'Waiting for Sarjy…'
  }
}

export function LiveView({ standup }: Props) {
  const { state, turns, start, end, reset } = standup
  const session = useSessionContext()
  const { state: agentState, canListen } = useAgent(session)
  const { canPlayAudio, startAudio } = useAudioPlayback(session.room)
  const { connectionState: connection, isConnected } = session
  const [microphoneError, setMicrophoneError] = useState<StandupError | null>(null)
  const { enabled: isMicrophoneEnabled, buttonProps } = useTrackToggle({
    room: session.room,
    source: Track.Source.Microphone,
    onDeviceError: (error) => setMicrophoneError(describeStartError(error)),
  })

  useEffect(() => {
    const onError = (error: Error) => setMicrophoneError(describeStartError(error))
    session.room.on(RoomEvent.MediaDevicesError, onError)
    return () => {
      session.room.off(RoomEvent.MediaDevicesError, onError)
    }
  }, [session.room])

  function retry() {
    setMicrophoneError(null)
    start()
  }

  const dismissError = () => setMicrophoneError(null)
  const blocked = state.status === 'failed'
  const error = blocked ? state.error : microphoneError

  const reconnecting =
    connection === ConnectionState.Reconnecting ||
    connection === ConnectionState.SignalReconnecting

  return (
    <Workspace rail={<TicketPanel />}>
      <AudioStatus
        agentState={agentState}
        microphoneEnabled={isMicrophoneEnabled}
        connected={isConnected}
      />

      {reconnecting && (
        <p className="text-sm text-amber" aria-live="polite">
          Reconnecting to the room…
        </p>
      )}

      {error && (
        <ConnectionNotice
          error={error}
          variant={blocked ? 'blocking' : 'inline'}
          onRetry={retry}
          onDismiss={blocked ? reset : dismissError}
        />
      )}

      {!blocked && !canPlayAudio && (
        <Button variant="secondary" size="sm" onClick={() => void startAudio()}>
          Enable audio playback
        </Button>
      )}

      {!blocked &&
        (canListen || turns.length > 0 ? (
          <Transcript turns={turns} placeholder="Say hello when you're ready." />
        ) : (
          <ConnectingNotice label={connectingLabel(agentState)} />
        ))}

      <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button
          {...buttonProps}
          variant="secondary"
          aria-pressed={!isMicrophoneEnabled}
          disabled={blocked || !isConnected || buttonProps.disabled}
        >
          {isMicrophoneEnabled ? <MicIcon /> : <MicOffIcon />}
          {isMicrophoneEnabled ? 'Mute' : 'Unmute'}
        </Button>
        <Button variant="danger" onClick={end}>
          <CloseIcon />
          End
        </Button>
      </div>
    </Workspace>
  )
}
