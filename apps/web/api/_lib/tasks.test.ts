import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TasksError, TasksResponse } from '../../shared/tasks'

const fetchStandupTasks = vi.hoisted(() => vi.fn())
vi.mock('./linear', () => ({ fetchStandupTasks }))

const { GET: handleTasksRequest } = await import('../tasks.js')

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

function get(url = 'http://localhost/api/tasks') {
  return handleTasksRequest(new Request(url))
}

describe('GET /api/tasks', () => {
  beforeEach(() => {
    fetchStandupTasks.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns the demo team’s tasks', async () => {
    fetchStandupTasks.mockResolvedValue({
      ok: true,
      teamKey: 'SAR',
      teamName: 'Sarjy',
      done: [],
      inProgress: [TASK],
      upcoming: [],
      openCount: 1,
      hasMore: true,
    })

    const response = await get()
    const body = (await response.json()) as TasksResponse

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body).toEqual({
      source: 'linear',
      teamKey: 'SAR',
      done: [],
      inProgress: [TASK],
      upcoming: [],
      openCount: 1,
      hasMore: true,
    })
  })

  it('returns an empty list as a 200, not an error', async () => {
    fetchStandupTasks.mockResolvedValue({
      ok: true,
      teamKey: 'SAR',
      teamName: 'Sarjy',
      done: [],
      inProgress: [],
      upcoming: [],
      openCount: 0,
      hasMore: false,
    })

    const response = await get()
    const body = (await response.json()) as TasksResponse

    expect(response.status).toBe(200)
    expect(body.openCount).toBe(0)
    expect(body.done).toEqual([])
    expect(body.inProgress).toEqual([])
    expect(body.upcoming).toEqual([])
  })

  it('takes no team parameter — a team key in the query string is ignored', async () => {
    fetchStandupTasks.mockResolvedValue({
      ok: true,
      teamKey: 'SAR',
      teamName: 'Sarjy',
      done: [],
      inProgress: [],
      upcoming: [],
      openCount: 0,
      hasMore: false,
    })

    const response = await get('http://localhost/api/tasks?team=ENG&teamKey=ENG')
    const body = (await response.json()) as TasksResponse

    expect(response.status).toBe(200)
    expect(body.teamKey).toBe('SAR')
    // The client's query string never reaches the Linear helper.
    expect(fetchStandupTasks).toHaveBeenCalledWith()
  })

  it.each([
    ['not_configured', 500, 'server_not_configured'],
    ['team_not_found', 500, 'server_not_configured'],
    ['unauthorized', 500, 'server_not_configured'],
    ['network_error', 503, 'upstream_unavailable'],
    ['linear_error', 502, 'upstream_error'],
  ])('maps a %s failure to HTTP %i', async (code, status, error) => {
    fetchStandupTasks.mockResolvedValue({ ok: false, error: code, message: 'detail' })

    const response = await get()
    const body = (await response.json()) as TasksError

    expect(response.status).toBe(status)
    expect(body.error).toBe(error)
    expect(body.message).toBeTruthy()
  })

  it('keeps the detailed reason out of the response body and in the log', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchStandupTasks.mockResolvedValue({
      ok: false,
      error: 'team_not_found',
      message: 'Accessible team keys: SAR (Sarjy), ACME (Acme Internal).',
    })

    const raw = await (await get()).text()

    // The workspace's other teams are nobody's business but ours.
    expect(raw).not.toContain('ACME')
    expect(errorSpy.mock.calls.flat().join(' ')).toContain('ACME')
  })

  it('rejects anything but GET', async () => {
    const response = await handleTasksRequest(
      new Request('http://localhost/api/tasks', { method: 'POST' }),
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('GET')
    expect(fetchStandupTasks).not.toHaveBeenCalled()
  })
})
