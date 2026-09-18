/**
 * The stand-up, driven by a real LiveKit session.
 *
 * Two state machines live here and are kept apart on purpose:
 *
 * - `stage` is the stand-up workflow: idle → live → finished. It is ours.
 * - `connection` and `agentState` come from LiveKit and describe the room and
 *   the agent. The UI reads them for the connecting/listening/thinking/speaking
 *   indicators; it never uses them to decide which screen to show.
 */
import {
  useAgent,
  useAudioPlayback,
  useLocalParticipant,
  useSessionMessages,
  type UseSessionReturn,
} from '@livekit/components-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConnectionState, MediaDeviceFailure, RoomEvent } from 'livekit-client'
import type { AudioState } from '../components/AudioStatus'
import {
  agentUnavailableError,
  connectionLostError,
  describeMicrophoneFailure,
  describeStartError,
  type StandupError,
} from './session'
import { toTurns, type Turn } from './transcript'

/** Where we are in the stand-up itself — independent of the connection. */
export type Stage = 'idle' | 'live' | 'finished'

export function useStandup(session: UseSessionReturn) {
  const agent = useAgent(session)
  const { messages } = useSessionMessages(session)
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant({ room: session.room })
  const { canPlayAudio, startAudio } = useAudioPlayback(session.room)

  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<StandupError | null>(null)
  const [isMicrophoneBusy, setMicrophoneBusy] = useState(false)
  const [finishedTurns, setFinishedTurns] = useState<Turn[]>([])
  const [duration, setDuration] = useState<number | null>(null)

  const turns = useMemo(() => toTurns(messages), [messages])

  // Refs for values read inside callbacks and listeners, where a stale closure
  // would otherwise report the wrong thing.
  const turnsRef = useRef(turns)
  const errorRef = useRef<StandupError | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const endingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  // The recap is built from whatever was on screen when End was pressed, and
  // LiveKit clears its transcript on disconnect — so keep a copy to hand.
  useEffect(() => {
    turnsRef.current = turns
  }, [turns])

  /** First error wins: a later generic failure must not mask the real cause. */
  const reportError = useCallback((next: StandupError) => {
    if (errorRef.current) return
    errorRef.current = next
    setError(next)
  }, [])

  const connection = session.connectionState
  const isConnected = session.isConnected

  // Time the call from the moment the room is actually connected.
  useEffect(() => {
    if (connection === ConnectionState.Connected && startedAtRef.current === null) {
      startedAtRef.current = Date.now()
    }
  }, [connection])

  // The agent was dispatched but never took the call (or gave up mid-way).
  // `session.start()` waits on the agent, so abort it too or it never settles.
  useEffect(() => {
    if (agent.state !== 'failed') return
    reportError(agentUnavailableError(agent.failureReasons))
    abortRef.current?.abort()
  }, [agent.state, agent.failureReasons, reportError])

  // The room dropped without us asking it to.
  useEffect(() => {
    if (stage !== 'live') return
    if (connection !== ConnectionState.Disconnected) return
    if (endingRef.current || startedAtRef.current === null) return
    reportError(connectionLostError())
  }, [stage, connection, reportError])

  // Device trouble raised by the SDK rather than by one of our own calls.
  useEffect(() => {
    const room = session.room
    const onMediaDevicesError = (deviceError: Error) => {
      const failure = MediaDeviceFailure.getFailure(deviceError)
      if (failure) reportError(describeMicrophoneFailure(failure))
    }

    room.on(RoomEvent.MediaDevicesError, onMediaDevicesError)
    return () => {
      room.off(RoomEvent.MediaDevicesError, onMediaDevicesError)
    }
  }, [session.room, reportError])

  /** Leave the room and stop capturing, whatever state we got stuck in. */
  const disconnect = useCallback(async () => {
    endingRef.current = true
    abortRef.current?.abort()
    abortRef.current = null

    try {
      await session.room.localParticipant.setMicrophoneEnabled(false)
    } catch {
      // The track may never have been published; disconnecting still matters.
    }
    await session.end()
  }, [session])

  const connect = useCallback(async () => {
    errorRef.current = null
    setError(null)
    endingRef.current = false
    startedAtRef.current = null
    setDuration(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await session.start({
        signal: controller.signal,
        // Join and go live on the microphone in one step. The pre-connect
        // buffer keeps whatever the user says before the agent is ready.
        tracks: { microphone: { enabled: true, publishOptions: { preConnectBuffer: true } } },
      })
      abortRef.current = null
    } catch (failure) {
      reportError(describeStartError(failure))
      await disconnect()
    }
  }, [session, disconnect, reportError])

  /** "Start stand-up": enter the live stage, then connect. */
  const start = useCallback(() => {
    setFinishedTurns([])
    setStage('live')
    void connect()
  }, [connect])

  /** Same connection attempt again, without leaving the live stage. */
  const retry = useCallback(() => {
    void connect()
  }, [connect])

  /** "End": hang up, keep the transcript we collected, show the recap. */
  const end = useCallback(async () => {
    setFinishedTurns(turnsRef.current)
    setDuration(startedAtRef.current === null ? null : Date.now() - startedAtRef.current)
    setStage('finished')
    await disconnect()
  }, [disconnect])

  /** Back to the start screen from the recap or from a failed connection. */
  const reset = useCallback(async () => {
    if (session.connectionState !== ConnectionState.Disconnected) await disconnect()
    errorRef.current = null
    setError(null)
    setFinishedTurns([])
    setDuration(null)
    setStage('idle')
  }, [session, disconnect])

  const toggleMicrophone = useCallback(async () => {
    setMicrophoneBusy(true)
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
    } catch (failure) {
      const deviceFailure = MediaDeviceFailure.getFailure(failure)
      reportError(deviceFailure ? describeMicrophoneFailure(deviceFailure) : describeStartError(failure))
    } finally {
      setMicrophoneBusy(false)
    }
  }, [localParticipant, isMicrophoneEnabled, reportError])

  const dismissError = useCallback(() => {
    errorRef.current = null
    setError(null)
  }, [])

  // Never leave a room (or a live microphone) behind.
  useEffect(() => {
    const room = session.room
    return () => {
      if (room.state !== ConnectionState.Disconnected) void room.disconnect()
    }
  }, [session.room])

  return {
    stage,
    /** Room-level connection state, straight from LiveKit. */
    connection,
    isConnected,
    /** Agent-level state: connecting, listening, thinking, speaking, … */
    agentState: agent.state,
    audioState: toAudioState(agent.state, isMicrophoneEnabled, isConnected),
    /** True once the agent is in the room and can hear the user. */
    canListen: agent.canListen,
    turns,
    finishedTurns,
    duration,
    error,
    isMicrophoneEnabled,
    isMicrophoneBusy,
    /** Browsers can block autoplay; the UI offers a button when they do. */
    canPlayAudio,
    startAudio,
    start,
    retry,
    end,
    reset,
    toggleMicrophone,
    dismissError,
  }
}

/** The status pill shows one of five things; LiveKit reports rather more. */
function toAudioState(
  agentState: ReturnType<typeof useAgent>['state'],
  isMicrophoneEnabled: boolean,
  isConnected: boolean,
): AudioState {
  if (isConnected && !isMicrophoneEnabled) return 'muted'

  switch (agentState) {
    case 'listening':
    case 'thinking':
    case 'speaking':
      return agentState
    default:
      // connecting, pre-connect-buffering, initializing, idle, disconnected, failed
      return 'connecting'
  }
}
