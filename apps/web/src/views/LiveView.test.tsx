// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { SessionProvider, useSession } from '@livekit/components-react'
import { ConnectionState, ParticipantEvent, Room, RoomEvent } from 'livekit-client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tokenSource, connectionLostError } from '../lib/session'
import type { StandupState } from '../lib/useStandup'
import { LiveView } from './LiveView'

vi.mock('../components/TicketPanel', () => ({ TicketPanel: () => null }))

beforeEach(() => {
  vi.spyOn(tokenSource, 'fetch').mockResolvedValue({ serverUrl: 'wss://room.test', participantToken: 'token' })
})
afterEach(async () => {
  await act(async () => cleanup())
  vi.restoreAllMocks()
})

function setup() {
  const room = new Room()
  room.state = ConnectionState.Connected
  vi.spyOn(room, 'prepareConnection').mockResolvedValue(undefined)
  vi.spyOn(room, 'disconnect').mockResolvedValue(undefined)
  let enabled = true
  vi.spyOn(room.localParticipant, 'isMicrophoneEnabled', 'get').mockImplementation(() => enabled)
  const microphone = vi.spyOn(room.localParticipant, 'setMicrophoneEnabled').mockImplementation(async (next) => {
    enabled = next
    room.localParticipant.emit(ParticipantEvent.ParticipantPermissionsChanged, undefined)
    return undefined
  })
  const actions = { start: vi.fn(), end: vi.fn(), reset: vi.fn() }
  function Harness({ state }: { state: StandupState }) {
    const session = useSession(tokenSource, { room })
    return (
      <SessionProvider session={session}>
        <LiveView standup={{ state, turns: [], ...actions }} />
      </SessionProvider>
    )
  }
  const view = render(<Harness state={{ status: 'active', startedAt: 0 }} />)
  return { room, microphone, actions, show: (state: StandupState) => view.rerender(<Harness state={state} />) }
}

it('uses the SDK toggle pending state and updates the mute button and status', async () => {
  const call = setup()
  const toggle = call.microphone.getMockImplementation()!
  let finish!: () => void
  call.microphone.mockImplementationOnce(async (...args) => {
    await new Promise<void>((resolve) => { finish = resolve })
    return toggle(...args)
  })
  const mute = screen.getByRole('button', { name: 'Mute' }) as HTMLButtonElement
  await userEvent.click(mute)
  expect(mute.disabled).toBe(true)
  await act(async () => finish())
  const unmute = screen.getByRole('button', { name: 'Unmute' }) as HTMLButtonElement
  expect(unmute.disabled).toBe(false)
  expect(unmute.getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByText('Mic muted')).toBeTruthy()
  await userEvent.click(unmute)
  expect(screen.getByRole('button', { name: 'Mute' }).getAttribute('aria-pressed')).toBe('false')
})

it('shows toggle errors as dismissible microphone warnings without restarting the call', async () => {
  const call = setup()
  call.microphone.mockRejectedValueOnce(Object.assign(new Error('No device'), { name: 'NotFoundError' }))
  await userEvent.click(screen.getByRole('button', { name: 'Mute' }))
  expect(screen.getByRole('alert').textContent).toContain('No microphone was found.')
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(call.actions.start).not.toHaveBeenCalled()
  expect(call.actions.reset).not.toHaveBeenCalled()
})

it('keeps fatal failures above microphone warnings and gives Retry and Back their own actions', async () => {
  const call = setup()
  act(() => { call.room.emit(RoomEvent.MediaDevicesError, new DOMException('No device', 'NotFoundError')) })
  call.show({ status: 'failed', error: connectionLostError() })
  expect(screen.getByRole('alert').textContent).toContain('The connection to the stand-up room dropped.')
  expect(screen.queryByText('No microphone was found.')).toBeNull()
  expect((screen.getByRole('button', { name: 'Mute' }) as HTMLButtonElement).disabled).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(call.actions.reset).toHaveBeenCalledOnce()
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(call.actions.start).toHaveBeenCalledOnce()
  call.show({ status: 'connecting' })
  expect(screen.queryByRole('alert')).toBeNull()
})

