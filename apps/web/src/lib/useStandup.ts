import { useAgent, useSessionMessages, type UseSessionReturn } from '@livekit/components-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { RoomEvent } from 'livekit-client'
import {
  agentUnavailableError,
  connectionLostError,
  describeStartError,
  tokenSource,
  type StandupError,
} from './session'
import { toTurns, type Turn } from './transcript'

export type StandupState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'active'; startedAt: number }
  | { status: 'failed'; error: StandupError }
  | { status: 'finished'; turns: Turn[]; durationMs: number | null }

type Attempt = {
  controller: AbortController
  started: boolean
  settled: Promise<void>
}


function stop(attempt: Attempt | null, session: UseSessionReturn) {
  if (!attempt || attempt.controller.signal.aborted) return attempt?.settled
  attempt.controller.abort()

  async function disconnect() {
    const [, disconnected] = await Promise.allSettled([
      session.room.localParticipant.setMicrophoneEnabled(false),
      session.end(),
    ])
    if (disconnected.status === 'rejected') throw disconnected.reason
  }

  attempt.settled = Promise.allSettled([attempt.settled, disconnect()])
    .then(disconnect)
    .catch((error: unknown) => console.error('Could not clean up the stand-up.', error))
  return attempt.settled
}

export function useStandup(session: UseSessionReturn) {
  const agent = useAgent(session)
  const { messages } = useSessionMessages(session)
  const [state, setState] = useState<StandupState>({ status: 'idle' })
  const attempt = useRef<Attempt | null>(null)
  const turns = toTurns(messages)

  function start() {
    const previous = attempt.current
    if (previous && !previous.controller.signal.aborted) return

    const next: Attempt = {
      controller: new AbortController(),
      started: false,
      settled: Promise.resolve(),
    }
    attempt.current = next
    setState({ status: 'connecting' })

    next.settled = (async () => {
      await previous?.settled
      if (next.controller.signal.aborted) return
      next.started = true
      const { signal } = next.controller

      // session.start() can connect after an abort during token fetching.
      // Guard the join ourselves and drain both operations before any retry.
      const joining = tokenSource.fetch({}).then(({ serverUrl, participantToken }) => {
        signal.throwIfAborted()
        return session.room.connect(serverUrl, participantToken)
      })
      const microphone = session.room.localParticipant.setMicrophoneEnabled(
        true, undefined, { preConnectBuffer: true },
      )

      try {
        await Promise.all([joining, microphone])
        signal.throwIfAborted()
        await agent.waitUntilConnected(signal)
        if (!signal.aborted) {
          setState({ status: 'active', startedAt: Date.now() })
        }
      } catch (error) {
        if (next.controller.signal.aborted) return
        setState({ status: 'failed', error: describeStartError(error) })
        void stop(next, session)
      } finally {
        await Promise.allSettled([joining, microphone])
      }
    })()
  }

  function end() {
    setState({
      status: 'finished',
      turns,
      durationMs: state.status === 'active' ? Date.now() - state.startedAt : null,
    })
    void stop(attempt.current, session)
  }

  function reset() {
    setState({ status: 'idle' })
    void stop(attempt.current, session)
  }

  const fail = useEffectEvent((error: StandupError) => {
    const current = attempt.current
    if (!current?.started || current.controller.signal.aborted) return
    setState({ status: 'failed', error })
    void stop(current, session)
  })

  const cancel = useEffectEvent(() => {
    void stop(attempt.current, session)
  })

  useEffect(() => {
    if (agent.state === 'failed') fail(agentUnavailableError(agent.failureReasons))
  }, [agent.state, agent.failureReasons])

  useEffect(() => {
    const onDisconnected = () => fail(connectionLostError())
    session.room.on(RoomEvent.Disconnected, onDisconnected)
    return () => {
      session.room.off(RoomEvent.Disconnected, onDisconnected)
      cancel()
    }
  }, [session.room])

  return { state, turns, start, end, reset }
}
