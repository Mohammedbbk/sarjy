import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchStandupTasks, updateTask } from './linear'

const ENV = { LINEAR_API_KEY: 'test-key', LINEAR_TEAM_KEY: 'sar' }

const ISSUE_NODE = {
  id: 'issue-uuid',
  identifier: 'SAR-4',
  title: 'Wire the ticket rail to Linear',
  priority: 2,
  priorityLabel: 'High',
  url: 'https://linear.app/sarjy/issue/SAR-4',
  state: { name: 'In Progress', type: 'started' },
}

function openIssues(nodes = [ISSUE_NODE], teams = [{ key: 'SAR', name: 'Sarjy' }]) {
  return { data: { teams: { nodes: teams }, issues: { nodes, pageInfo: { hasNextPage: false } } } }
}

/** Fake Linear: answers each request with the next queued body (or error). */
function fakeLinear(...replies: (unknown | Error)[]) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
    const reply = replies.shift()
    if (reply instanceof Error) throw reply
    if (reply instanceof Response) return reply
    return Response.json(reply)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** The GraphQL variables sent with request number `call`. */
function variables(fetchMock: ReturnType<typeof fakeLinear>, call: number) {
  const init = fetchMock.mock.calls[call]![1]
  return (JSON.parse(init.body as string) as { variables: Record<string, unknown> }).variables
}

beforeEach(() => vi.unstubAllGlobals())
afterEach(() => vi.unstubAllGlobals())

describe('fetchStandupTasks', () => {
  it('returns the team and its open issues as tasks', async () => {
    const fetchMock = fakeLinear(openIssues())

    expect(await fetchStandupTasks(ENV)).toEqual({
      ok: true,
      teamKey: 'SAR',
      teamName: 'Sarjy',
      hasMore: false,
      tasks: [
        {
          id: 'issue-uuid',
          identifier: 'SAR-4',
          title: 'Wire the ticket rail to Linear',
          status: 'In Progress',
          statusType: 'started',
          priority: 2,
          priorityLabel: 'High',
          url: 'https://linear.app/sarjy/issue/SAR-4',
        },
      ],
    })
    expect(variables(fetchMock, 0)).toEqual({
      teamKey: 'sar',
      first: 25,
      closedTypes: ['completed', 'canceled'],
    })
  })

  it('shows an unfamiliar state category as unstarted, keeping its name', async () => {
    fakeLinear(openIssues([{ ...ISSUE_NODE, state: { name: 'Duplicate', type: 'duplicate' } }]))

    const result = await fetchStandupTasks(ENV)

    expect(result.ok && result.tasks[0]).toMatchObject({ status: 'Duplicate', statusType: 'unstarted' })
  })

  it('reports a team key that matches no team', async () => {
    fakeLinear(openIssues([], []))
    expect(await fetchStandupTasks(ENV)).toMatchObject({ ok: false, error: 'team_not_found' })
  })

  it('reports missing configuration without calling Linear', async () => {
    const fetchMock = fakeLinear()
    expect(await fetchStandupTasks({})).toMatchObject({ ok: false, error: 'not_configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['a rejected key', new Response('', { status: 401 }), 'unauthorized'],
    ['an auth error in the body', { errors: [{ message: 'Authentication required' }] }, 'unauthorized'],
    ['a query error', { errors: [{ message: 'Field "x" is not defined' }] }, 'linear_error'],
    ['a server error', new Response('oops', { status: 500 }), 'linear_error'],
    ['a network failure', new TypeError('fetch failed'), 'network_error'],
    ['a timeout', new DOMException('slow', 'TimeoutError'), 'timeout'],
  ])('reports %s', async (_case, reply, error) => {
    fakeLinear(reply)
    expect(await fetchStandupTasks(ENV)).toMatchObject({ ok: false, error })
  })

  it('never puts the API key in an error message', async () => {
    fakeLinear(new TypeError('fetch failed'))
    expect(JSON.stringify(await fetchStandupTasks(ENV))).not.toContain('test-key')
  })
})

describe('updateTask', () => {
  const FOUND = {
    id: 'issue-uuid',
    identifier: 'SAR-12',
    state: { name: 'In Progress' },
    team: { states: { nodes: [{ id: 'state-review', name: 'In Review' }] } },
  }
  const found = (nodes: unknown[] = [FOUND]) => ({ data: { issues: { nodes } } })
  const ok = { data: { success: true } }

  it('finds the issue by team and number, then moves it and comments', async () => {
    const fetchMock = fakeLinear(found(), ok, ok)

    const result = await updateTask(
      { identifier: 'SAR-12', status: 'in review', comment: 'Ready for review.' },
      ENV,
    )

    expect(result).toEqual({ ok: true, identifier: 'SAR-12', status: 'In Review' })
    expect(variables(fetchMock, 0)).toEqual({ teamKey: 'sar', number: 12 })
    expect(variables(fetchMock, 1)).toEqual({ id: 'issue-uuid', stateId: 'state-review' })
    expect(variables(fetchMock, 2)).toEqual({
      issueId: 'issue-uuid',
      body: 'Ready for review.\n\n— via Sarjy',
    })
  })

  it('refuses a ticket from another team without asking Linear', async () => {
    const fetchMock = fakeLinear()
    const result = await updateTask({ identifier: 'ENG-1', status: 'Done' }, ENV)
    expect(result).toMatchObject({ ok: false, error: 'task_not_found' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a ticket number that does not exist', async () => {
    fakeLinear(found([]))
    const result = await updateTask({ identifier: 'SAR-999', status: 'Done' }, ENV)
    expect(result).toMatchObject({ ok: false, error: 'task_not_found' })
  })

  it('refuses an unknown status, naming the valid ones, without writing', async () => {
    const fetchMock = fakeLinear(found())

    const result = await updateTask({ identifier: 'SAR-12', status: 'Shipped' }, ENV)

    expect(result).toMatchObject({ ok: false, error: 'unknown_status' })
    expect(!result.ok && result.message).toContain('In Review')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
