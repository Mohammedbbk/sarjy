// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { useSession } from '@livekit/components-react'
import { ConnectionState, ParticipantKind, RemoteParticipant, Room, RoomEvent } from 'livekit-client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tokenSource } from './session'
import { useStandup } from './useStandup'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(tokenSource, 'fetch').mockResolvedValue({ serverUrl: 'wss://room.test', participantToken: 'token' })
})
afterEach(async () => {
  await act(async () => cleanup())
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function setup() {
  const room = new Room()
  vi.spyOn(room, 'prepareConnection').mockResolvedValue(undefined)
  vi.spyOn(room.localParticipant, 'setMicrophoneEnabled').mockResolvedValue(undefined)
  const connect = vi.spyOn(room, 'connect').mockImplementation(async () => {
    room.state = ConnectionState.Connected
    room.emit(RoomEvent.ConnectionStateChanged, room.state)
  })
  vi.spyOn(room, 'disconnect').mockImplementation(async () => {
    room.state = ConnectionState.Disconnected
    room.remoteParticipants.clear()
    room.emit(RoomEvent.ConnectionStateChanged, room.state)
    room.emit(RoomEvent.Disconnected)
  })
  const hook = renderHook(() => {
    const session = useSession(tokenSource, { room, agentConnectTimeoutMilliseconds: 20_000 })
    return useStandup(session)
  })
  return { ...hook, room, connect }
}

it('uses the real SDK agent timeout and can retry after its failure state resets', async () => {
  const call = setup()
  await act(async () => call.result.current.start())
  expect(call.result.current.state.status).toBe('connecting')
  await act(async () => vi.advanceTimersByTimeAsync(20_000))
  expect(call.result.current.state).toMatchObject({ status: 'failed', error: { kind: 'agent-unavailable' } })
  await act(async () => call.result.current.start())
  expect(call.connect).toHaveBeenCalledTimes(2)
  expect(call.result.current.state.status).toBe('connecting')
  await act(async () => vi.advanceTimersByTimeAsync(20_000))
  expect(call.result.current.state).toMatchObject({ status: 'failed', error: { kind: 'agent-unavailable' } })
})

it('becomes active when the real agent hook sees a ready agent and ends without a false failure', async () => {
  const call = setup()
  await act(async () => call.result.current.start())
  const agent = new RemoteParticipant(
    call.room.engine.client, 'agent-sid', 'sarjy', 'Sarjy', undefined,
    { 'lk.agent.state': 'listening' }, undefined, ParticipantKind.AGENT,
  )
  await act(async () => {
    call.room.remoteParticipants.set(agent.identity, agent)
    call.room.emit(RoomEvent.ParticipantConnected, agent)
  })
  expect(call.result.current.state.status).toBe('active')
  await act(async () => vi.advanceTimersByTimeAsync(2_000))
  await act(async () => call.result.current.end())
  expect(call.result.current.state).toEqual({ status: 'finished', turns: [], durationMs: 2_000 })
})
