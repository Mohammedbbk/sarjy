import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchStandupTasks } from './linear'

const ENV = { LINEAR_API_KEY: 'test-key', LINEAR_TEAM_KEY: 'eng' }

const TEAMS_PAGE = {
  teams: {
    nodes: [
      { id: 'team-uuid-1', key: 'ENG', name: 'Engineering' },
      { id: 'team-uuid-2', key: 'DES', name: 'Design' },
    ],
    pageInfo: { hasNextPage: false },
  },
}

function issuesPage(nodes: unknown[], hasNextPage = false) {
  return { issues: { nodes, pageInfo: { hasNextPage } } }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Queue one Response (or thrown error) per request, in order. */
function mockFetchSequence(...steps: (Response | Error)[]) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
    const step = steps.shift()
    if (!step) throw new Error('unexpected extra fetch call')
    if (step instanceof Error) throw step
    return step
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchStandupTasks — successful mapping', () => {
  it('maps issues to compact tasks and keeps the UUID separate from the identifier', async () => {
    const fetchMock = mockFetchSequence(
      jsonResponse({ data: TEAMS_PAGE }),
      jsonResponse({
        data: issuesPage([
          {
            id: '9f1c2d3e-0000-4000-8000-aaaaaaaaaaaa',
            identifier: 'ENG-482',
            title: 'KYC onboarding validation',
            priority: 2,
            priorityLabel: 'High',
            url: 'https://linear.app/acme/issue/ENG-482/kyc-onboarding-validation',
            state: { name: 'In Progress', type: 'started' },
          },
        ]),
      }),
    )

    const result = await fetchStandupTasks(ENV)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.tasks).toEqual([
      {
        id: '9f1c2d3e-0000-4000-8000-aaaaaaaaaaaa',
        identifier: 'ENG-482',
        title: 'KYC onboarding validation',
        status: 'In Progress',
        statusType: 'started',
        priority: 2,
        priorityLabel: 'High',
        url: 'https://linear.app/acme/issue/ENG-482/kyc-onboarding-validation',
      },
    ])
    expect(result.tasks[0]!.id).not.toBe(result.tasks[0]!.identifier)
    expect(result.hasMore).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('resolves the team key case-insensitively and reports Linear’s own casing', async () => {
    mockFetchSequence(jsonResponse({ data: TEAMS_PAGE }), jsonResponse({ data: issuesPage([]) }))

    const result = await fetchStandupTasks({ ...ENV, LINEAR_TEAM_KEY: 'eNg' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.teamKey).toBe('ENG')
    expect(result.teamName).toBe('Engineering')
  })

  it('queries issues by the resolved team UUID, excluding closed and archived work', async () => {
    const fetchMock = mockFetchSequence(
      jsonResponse({ data: TEAMS_PAGE }),
      jsonResponse({ data: issuesPage([]) }),
    )

    await fetchStandupTasks(ENV)

    const issuesCall = fetchMock.mock.calls[1]![1]
    const payload = JSON.parse(String(issuesCall.body)) as {
      query: string
      variables: Record<string, unknown>
    }
    expect(payload.variables).toMatchObject({
      teamId: 'team-uuid-1',
      first: 25,
      closedTypes: ['completed', 'canceled'],
    })
    expect(payload.query).toContain('includeArchived: false')
    expect(payload.query).not.toMatch(/\bmutation\b/)
  })

  it('reports hasMore so the agent does not imply the list is exhaustive', async () => {
    mockFetchSequence(
      jsonResponse({ data: TEAMS_PAGE }),
      jsonResponse({
        data: issuesPage(
          [
            {
              id: 'uuid-a',
              identifier: 'ENG-1',
              title: 'A',
              priority: 0,
              priorityLabel: 'No priority',
              url: 'https://linear.app/acme/issue/ENG-1',
              state: { name: 'Todo', type: 'unstarted' },
            },
          ],
          true,
        ),
      }),
    )

    const result = await fetchStandupTasks(ENV)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.hasMore).toBe(true)
  })
})

describe('fetchStandupTasks — empty results', () => {
  it('treats no open issues as success, not failure', async () => {
    mockFetchSequence(jsonResponse({ data: TEAMS_PAGE }), jsonResponse({ data: issuesPage([]) }))

    const result = await fetchStandupTasks(ENV)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tasks).toEqual([])
    expect(result.hasMore).toBe(false)
    expect(result.teamKey).toBe('ENG')
  })
})

describe('fetchStandupTasks — failures', () => {
  it('reports missing configuration without calling the API', async () => {
    const fetchMock = mockFetchSequence()

    const result = await fetchStandupTasks({})

    expect(result).toMatchObject({ ok: false, error: 'not_configured' })
    if (result.ok) return
    expect(result.message).toContain('LINEAR_API_KEY')
    expect(result.message).toContain('LINEAR_TEAM_KEY')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains a team key that is really a display name, and selects no team', async () => {
    const fetchMock = mockFetchSequence(jsonResponse({ data: TEAMS_PAGE }))

    const result = await fetchStandupTasks({ ...ENV, LINEAR_TEAM_KEY: 'Engineering' })

    expect(result).toMatchObject({ ok: false, error: 'team_not_found' })
    if (result.ok) return
    expect(result.message).toContain('Engineering')
    expect(result.message).toContain('ENG (Engineering)')
    expect(result.message).toMatch(/display name/i)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports an authentication failure', async () => {
    const result = await (mockFetchSequence(jsonResponse({}, 401)), fetchStandupTasks(ENV))

    expect(result).toMatchObject({ ok: false, error: 'unauthorized' })
  })

  it('reports an authentication failure returned as a GraphQL error on HTTP 200', async () => {
    mockFetchSequence(jsonResponse({ errors: [{ message: 'Authentication required' }] }))

    const result = await fetchStandupTasks(ENV)

    expect(result).toMatchObject({ ok: false, error: 'unauthorized' })
  })

  it('reports GraphQL errors returned on HTTP 200', async () => {
    mockFetchSequence(
      jsonResponse({ data: TEAMS_PAGE }),
      jsonResponse({ data: null, errors: [{ message: 'Unknown field "nope"' }] }),
    )

    const result = await fetchStandupTasks(ENV)

    expect(result).toMatchObject({ ok: false, error: 'graphql_error' })
    if (result.ok) return
    expect(result.message).toContain('Unknown field')
  })

  it('reports a server-side HTTP error', async () => {
    mockFetchSequence(new Response('upstream boom', { status: 503 }))

    const result = await fetchStandupTasks(ENV)

    expect(result).toMatchObject({ ok: false, error: 'http_error' })
    if (result.ok) return
    expect(result.message).toContain('503')
  })

  it('reports a network failure', async () => {
    mockFetchSequence(new TypeError('fetch failed'))

    const result = await fetchStandupTasks(ENV)

    expect(result).toMatchObject({ ok: false, error: 'network_error' })
  })

  it('reports a timeout when Linear does not respond in time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      ),
    )
    vi.useFakeTimers()

    const pending = fetchStandupTasks(ENV)
    await vi.advanceTimersByTimeAsync(6000)
    const result = await pending
    vi.useRealTimers()

    expect(result).toMatchObject({ ok: false, error: 'timeout' })
  })

  it('never leaks the API key into an error message', async () => {
    mockFetchSequence(jsonResponse({ errors: [{ message: 'Something went wrong' }] }))

    const result = await fetchStandupTasks({ ...ENV, LINEAR_API_KEY: 'lin_api_supersecret' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).not.toContain('lin_api_supersecret')
  })
})

describe('fetchStandupTasks — status type normalisation', () => {
  it('passes through the state categories the UI styles', async () => {
    mockFetchSequence(
      jsonResponse({ data: TEAMS_PAGE }),
      jsonResponse({
        data: issuesPage(
          ['triage', 'backlog', 'unstarted', 'started'].map((type, i) => ({
            id: `uuid-${i}`,
            identifier: `ENG-${i}`,
            title: type,
            priority: 0,
            priorityLabel: 'No priority',
            url: `https://linear.app/acme/issue/ENG-${i}`,
            state: { name: type, type },
          })),
        ),
      }),
    )

    const result = await fetchStandupTasks(ENV)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tasks.map((t) => t.statusType)).toEqual([
      'triage',
      'backlog',
      'unstarted',
      'started',
    ])
  })

  it('falls back to unstarted for an unknown category but keeps the real name', async () => {
    mockFetchSequence(
      jsonResponse({ data: TEAMS_PAGE }),
      jsonResponse({
        data: issuesPage([
          {
            id: 'uuid-x',
            identifier: 'ENG-9',
            title: 'Superseded',
            priority: 0,
            priorityLabel: 'No priority',
            url: 'https://linear.app/acme/issue/ENG-9',
            state: { name: 'Duplicate', type: 'duplicate' },
          },
        ]),
      }),
    )

    const result = await fetchStandupTasks(ENV)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tasks[0]!.statusType).toBe('unstarted')
    expect(result.tasks[0]!.status).toBe('Duplicate')
  })
})
