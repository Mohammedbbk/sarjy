// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TasksResponse } from '../../shared/tasks'
import { TicketPanel } from './TicketPanel'

/** The rail's four states, driven by what GET /api/tasks returns. */

const TASK = {
  id: '9f1c2d3e-0000-4000-8000-aaaaaaaaaaaa',
  identifier: 'SAR-4',
  title: 'Wire the ticket rail to Linear',
  status: 'In Progress',
  statusType: 'started' as const,
  priority: 2,
  priorityLabel: 'High',
  url: 'https://linear.app/sarjy/issue/SAR-4',
}

function tasksResponse(overrides: Partial<TasksResponse> = {}): TasksResponse {
  return {
    source: 'linear',
    teamKey: 'SAR',
    done: [],
    inProgress: [TASK],
    upcoming: [],
    openCount: 1,
    hasMore: false,
    ...overrides,
  }
}

/** Mount the panel with its own cache, so tests never share query state. */
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <TicketPanel />
    </QueryClientProvider>,
  )
}

/** One queued response per call, so a retry can differ from the first attempt. */
function mockFetchSequence(...steps: Response[]) {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => {
    const step = steps.shift()
    if (!step) throw new Error('unexpected extra fetch call')
    return step
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('TicketPanel', () => {
  it('shows a loading placeholder before the first response', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))

    mount()

    expect(screen.getByLabelText('Loading tickets')).toBeTruthy()
    expect(screen.queryByText(/No open tickets/)).toBeNull()
  })

  it('renders tickets and derives the count from the response', async () => {
    mockFetchSequence(Response.json(tasksResponse()))

    mount()

    expect(await screen.findByText('SAR-4')).toBeTruthy()
    expect(screen.getByText('Wire the ticket rail to Linear')).toBeTruthy()
    expect(screen.getByText('In Progress')).toBeTruthy()
    expect(screen.getByText('1 open')).toBeTruthy()
    expect(screen.queryByText(/more open tickets/)).toBeNull()
  })

  it('flags that more tickets exist when hasMore is true', async () => {
    mockFetchSequence(Response.json(tasksResponse({ hasMore: true })))

    mount()

    expect(await screen.findByText('1+ open')).toBeTruthy()
    expect(screen.getByText(/The team has more open tickets/)).toBeTruthy()
  })

  it('distinguishes an empty list from a failure', async () => {
    mockFetchSequence(Response.json(tasksResponse({ openCount: 0, inProgress: [] })))

    mount()

    expect(await screen.findByText(/No tickets on this team yet/)).toBeTruthy()
    expect(screen.getByText('0 open')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull()
  })

  it('shows the endpoint’s message and recovers through Retry', async () => {
    const unavailable = () =>
      Response.json(
        { error: 'upstream_unavailable', message: 'Linear took too long to respond.' },
        { status: 503 },
      )
    const fetchMock = mockFetchSequence(unavailable(), unavailable(), Response.json(tasksResponse()))

    mount()

    const retry = await screen.findByRole('button', { name: /Try again/ })
    expect(screen.getByText('Linear took too long to respond.')).toBeTruthy()
    expect(screen.queryByText(/No open tickets/)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await userEvent.click(retry)

    expect(await screen.findByText('SAR-4')).toBeTruthy()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
  })

  it('does not retry a misconfigured server on its own', async () => {
    const fetchMock = mockFetchSequence(
      Response.json(
        { error: 'server_not_configured', message: 'The server is missing its Linear credentials.' },
        { status: 500 },
      ),
    )

    mount()

    await screen.findByRole('button', { name: /Try again/ })
    expect(screen.getByText('The server is missing its Linear credentials.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('calls the endpoint with no parameters', async () => {
    const fetchMock = mockFetchSequence(Response.json(tasksResponse()))

    mount()
    await screen.findByText('SAR-4')

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/tasks')
  })

  it('states how tickets change, under the demo workspace label', async () => {
    mockFetchSequence(Response.json(tasksResponse()))

    mount()
    await screen.findByText('SAR-4')

    expect(screen.getByText('Demo workspace')).toBeTruthy()
    expect(screen.getByText(/only changes a ticket after you confirm/)).toBeTruthy()
  })
})
