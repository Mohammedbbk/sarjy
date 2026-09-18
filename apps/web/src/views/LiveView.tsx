import { ConnectionState } from 'livekit-client'
import { AudioStatus } from '../components/AudioStatus'
import { Button } from '../components/Button'
import { ConnectingNotice, ConnectionNotice } from '../components/ConnectionNotice'
import { Workspace } from '../components/Layout'
import { TicketPanel } from '../components/TicketPanel'
import { Transcript } from '../components/Transcript'
import { CloseIcon, MicIcon, MicOffIcon } from '../components/icons'
import type { useStandup } from '../lib/useStandup'

type Props = {
  standup: ReturnType<typeof useStandup>
}

/** What is happening before the agent can hear you, in words. */
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

/** Live: the stand-up is running on a real LiveKit session. */
export function LiveView({ standup }: Props) {
  const {
    agentState,
    audioState,
    canListen,
    canPlayAudio,
    connection,
    dismissError,
    end,
    error,
    isConnected,
    isMicrophoneBusy,
    isMicrophoneEnabled,
    reset,
    retry,
    startAudio,
    toggleMicrophone,
    turns,
  } = standup

  // A failure before we are in the room replaces the conversation; one during
  // the call is a banner over a stand-up that is still running.
  const blocked = error !== null && !isConnected

  const reconnecting =
    connection === ConnectionState.Reconnecting ||
    connection === ConnectionState.SignalReconnecting

  return (
    <Workspace rail={<TicketPanel />}>
      <AudioStatus state={audioState} />

      {reconnecting && (
        <p className="text-sm text-amber" aria-live="polite">
          Reconnecting to the room…
        </p>
      )}

      {error && (
        <ConnectionNotice
          error={error}
          variant={blocked ? 'blocking' : 'inline'}
          onRetry={blocked ? retry : dismissError}
          onDismiss={blocked ? () => void reset() : dismissError}
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

      {/*
        The stage track (Review · Blockers · Today · Confirm) and ticket
        proposals are not shown: the agent reports no workflow position and
        cannot change a ticket, so any progress we drew here would be invented.
      */}

      <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button
          variant="secondary"
          aria-pressed={!isMicrophoneEnabled}
          disabled={!isConnected || isMicrophoneBusy}
          onClick={() => void toggleMicrophone()}
        >
          {isMicrophoneEnabled ? <MicIcon /> : <MicOffIcon />}
          {isMicrophoneEnabled ? 'Mute' : 'Unmute'}
        </Button>
        <Button variant="danger" onClick={() => void end()}>
          <CloseIcon />
          End
        </Button>
      </div>
    </Workspace>
  )
}
