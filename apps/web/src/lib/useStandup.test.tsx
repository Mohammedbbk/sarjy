// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { Room, RoomEvent } from 'livekit-client'
import type { ReceivedMessage, UseSessionReturn } from '@livekit/components-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStandup } from './useStandup'

const sdk = vi.hoisted(() => ({
  agent: { state: 'connecting', failureReasons: null as string[] | null },
  messages: [] as ReceivedMessage[],
  fetchToken: vi.fn(),
  waitForAgent: vi.fn<(signal?: AbortSignal) => Promise<void>>(),
}))
vi.mock('@livekit/components-react', () => ({
  useAgent: () => ({ ...sdk.agent, waitUntilConnected: sdk.waitForAgent }),
  useSessionMessages: () => ({ messages: sdk.messages }),
}))

vi.mock('./session', async (importOriginal) => ({
  ...await importOriginal<typeof import('./session')>(),
  tokenSource: { fetch: sdk.fetchToken },
}))

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function setup() {
  const room = new Room()
  const start = vi.spyOn(room, 'connect').mockResolvedValue(undefined)
  const microphone = vi.spyOn(room.localParticipant, 'setMicrophoneEnabled').mockResolvedValue(undefined)
  const end = vi.fn(async () => {
    sdk.messages = []
    room.emit(RoomEvent.Disconnected)
  })
  const session = { room, start, end } as unknown as UseSessionReturn
  const listenersBefore = room.listenerCount(RoomEvent.Disconnected)
  const hook = renderHook(() => useStandup(session), { wrapper: StrictMode })
  return { ...hook, room, start, end, microphone, listenersBefore }
}

beforeEach(() => {
  sdk.agent = { state: 'connecting', failureReasons: null }
  sdk.messages = []
  sdk.fetchToken.mockReset().mockResolvedValue({ serverUrl: 'wss://room.test', participantToken: 'token' })
  sdk.waitForAgent.mockReset().mockResolvedValue(undefined)
})
afterEach(async () => {
  await act(async () => cleanup())
  vi.restoreAllMocks()
})

describe('useStandup', () => {
  it('times from agent readiness and preserves the latest transcript before disconnect', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const call = setup()
    const ready = deferred()
    call.start.mockReturnValueOnce(ready.promise)
    await act(async () => call.result.current.start())
    expect(call.result.current.state).toEqual({ status: 'connecting' })
    clock.mockReturnValue(4_000)
    await act(async () => ready.resolve())
    sdk.messages = [{ id: '1', type: 'userTranscript', message: 'Hello', timestamp: 4_000 }]
    call.rerender()
    const turns = call.result.current.turns
    clock.mockReturnValue(6_500)
    await act(async () => call.result.current.end())
    expect(call.result.current.state).toEqual({ status: 'finished', turns, durationMs: 2_500 })
    expect(turns[0]?.text).toBe('Hello')
    expect(sdk.messages).toEqual([])
    expect(call.room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false)
  })

  it('ignores repeated starts before React has rendered', async () => {
    const call = setup()
    await act(async () => {
      call.result.current.start()
      call.result.current.start()
    })
    expect(call.start).toHaveBeenCalledTimes(1)
  })

  it.each(['end', 'reset'] as const)('cancels immediately when %s runs before start reaches the SDK', async (action) => {
    const call = setup()
    await act(async () => {
      call.result.current.start()
      call.result.current[action]()
    })
    expect(call.start).not.toHaveBeenCalled()
    expect(call.result.current.state.status).toBe(action === 'end' ? 'finished' : 'idle')
  })

  it.each(['end', 'reset'] as const)('keeps the chosen screen after %s while a start finishes late', async (action) => {
    const call = setup()
    const ready = deferred()
    call.start.mockReturnValueOnce(ready.promise)
    await act(async () => call.result.current.start())
    await act(async () => call.result.current[action]())
    expect(call.end).toHaveBeenCalled()
    await act(async () => ready.resolve())
    expect(call.result.current.state.status).toBe(action === 'end' ? 'finished' : 'idle')
    if (call.result.current.state.status === 'finished') {
      expect(call.result.current.state.durationMs).toBeNull()
    }
  })

  it('waits for canceled work and its cleanup before starting another call', async () => {
    const call = setup()
    const first = deferred()
    const teardown = deferred()
    call.start.mockReturnValueOnce(first.promise)
    call.end.mockReturnValueOnce(teardown.promise)
    await act(async () => call.result.current.start())
    await act(async () => {
      call.result.current.end()
      call.result.current.start()
    })
    expect(call.start).toHaveBeenCalledTimes(1)
    await act(async () => first.reject(new Error('Late connection error')))
    expect(call.start).toHaveBeenCalledTimes(1)
    await act(async () => teardown.resolve())
    expect(call.start).toHaveBeenCalledTimes(2)
    expect(call.result.current.state.status).toBe('active')
    const disconnects = call.end.mock.calls.length
    await act(async () => Promise.resolve())
    expect(call.end).toHaveBeenCalledTimes(disconnects)
  })

  it('keeps the agent failure after abort rejects and SDK failure state clears', async () => {
    const call = setup()
    sdk.waitForAgent.mockImplementationOnce((signal) => new Promise((_, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    await act(async () => call.result.current.start())
    sdk.agent = { state: 'failed', failureReasons: ['Agent did not join the room.'] }
    await act(async () => call.rerender())
    sdk.agent = { state: 'disconnected', failureReasons: null }
    call.rerender()
    expect(call.result.current.state).toMatchObject({
      status: 'failed', error: { kind: 'agent-unavailable', detail: 'Agent did not join the room.' },
    })
    await act(async () => call.result.current.start())
    expect(call.result.current.state.status).toBe('active')
  })

  it('does not reuse a previous agent failure while Retry is waiting for cleanup', async () => {
    const call = setup()
    const ready = deferred()
    call.start.mockReturnValueOnce(ready.promise)
    await act(async () => call.result.current.start())
    sdk.agent = { state: 'failed', failureReasons: ['Agent unavailable'] }
    await act(async () => call.rerender())
    await act(async () => call.result.current.start())
    expect(call.result.current.state.status).toBe('connecting')
    await act(async () => ready.resolve())
    expect(call.result.current.state.status).toBe('active')
  })

  it('reports microphone permission denial and recovers through the same start action', async () => {
    const call = setup()
    call.microphone.mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError'),
    )
    await act(async () => call.result.current.start())
    expect(call.result.current.state).toMatchObject({ status: 'failed', error: { kind: 'microphone-denied' } })
    await act(async () => call.result.current.start())
    expect(call.result.current.state.status).toBe('active')
  })

  it('never joins with a token that arrives after End', async () => {
    const call = setup()
    const token = deferred()
    sdk.fetchToken.mockImplementationOnce(async () => {
      await token.promise
      return { serverUrl: 'wss://old.test', participantToken: 'old-token' }
    })
    await act(async () => call.result.current.start())
    await act(async () => call.result.current.end())
    await act(async () => token.resolve())
    expect(call.start).not.toHaveBeenCalled()
    expect(call.result.current.state.status).toBe('finished')
    await act(async () => call.result.current.start())
    expect(call.start).toHaveBeenCalledExactlyOnceWith('wss://room.test', 'token')
  })

  it('reports a mic failure immediately and drains a pending token before Retry', async () => {
    const call = setup()
    const token = deferred()
    sdk.fetchToken.mockImplementationOnce(async () => {
      await token.promise
      return { serverUrl: 'wss://old.test', participantToken: 'old-token' }
    })
    call.microphone.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    await act(async () => call.result.current.start())
    expect(call.result.current.state).toMatchObject({ status: 'failed', error: { kind: 'microphone-denied' } })
    await act(async () => call.result.current.start())
    expect(call.start).not.toHaveBeenCalled()
    await act(async () => token.resolve())
    expect(call.start).toHaveBeenCalledExactlyOnceWith('wss://room.test', 'token')
    expect(call.result.current.state.status).toBe('active')
  })

  it('cleans up a microphone that finishes acquiring after End before the next call', async () => {
    const call = setup()
    const microphone = deferred()
    call.microphone.mockImplementationOnce(async () => {
      await microphone.promise
      return undefined
    })
    await act(async () => call.result.current.start())
    await act(async () => {
      call.result.current.end()
      call.result.current.start()
    })
    expect(call.start).toHaveBeenCalledTimes(1)
    await act(async () => microphone.resolve())
    expect(call.start).toHaveBeenCalledTimes(2)
    expect(call.microphone.mock.calls.map(([enabled]) => enabled)).toEqual([true, false, false, true])
    expect(call.result.current.state.status).toBe('active')
  })

  it('allows reconnection but reports a terminal disconnect', async () => {
    const call = setup()
    await act(async () => call.result.current.start())
    act(() => { call.room.emit(RoomEvent.Reconnecting) })
    expect(call.result.current.state.status).toBe('active')
    await act(async () => { call.room.emit(RoomEvent.Disconnected) })
    expect(call.result.current.state).toMatchObject({
      status: 'failed', error: { message: 'The connection to the stand-up room dropped.' },
    })
    await act(async () => call.result.current.reset())
    expect(call.result.current.state).toEqual({ status: 'idle' })
  })

  it('starts a second call with a fresh transcript', async () => {
    const call = setup()
    await act(async () => call.result.current.start())
    sdk.messages = [{ id: 'old', type: 'userTranscript', message: 'Old call', timestamp: 1 }]
    call.rerender()
    await act(async () => call.result.current.end())
    await act(async () => call.result.current.start())
    expect(call.result.current.turns).toEqual([])
    sdk.messages = [{ id: 'new', type: 'userTranscript', message: 'New call', timestamp: 2 }]
    call.rerender()
    await act(async () => call.result.current.end())
    expect(call.result.current.state).toMatchObject({
      status: 'finished', turns: [{ id: 'new', text: 'New call' }],
    })
  })

  it('aborts pending work on unmount and removes its room listener', async () => {
    const call = setup()
    const ready = deferred()
    sdk.waitForAgent.mockReturnValueOnce(ready.promise)
    await act(async () => call.result.current.start())
    const signal = sdk.waitForAgent.mock.calls[0]?.[0]
    call.unmount()
    expect(signal?.aborted).toBe(true)
    expect(call.end).toHaveBeenCalled()
    expect(call.room.listenerCount(RoomEvent.Disconnected)).toBe(call.listenersBefore)
    await act(async () => ready.resolve())
    expect(call.end).toHaveBeenCalled()
  })
})
