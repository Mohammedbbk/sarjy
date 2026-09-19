import {
  AuthenticationLinearError,
  InvalidInputLinearError,
  NetworkLinearError,
} from '@linear/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Fake Linear SDK client: `teams()` and `createComment()` are all the code calls on it. */
const client = vi.hoisted(() => ({ teams: vi.fn(), createComment: vi.fn() }))
vi.mock('@linear/sdk', async (original) => ({
  ...(await original<typeof import('@linear/sdk')>()),
  LinearClient: class {
    teams = client.teams
    createComment = client.createComment
  },
}))

const { fetchStandupTasks, updateTask } = await import('./linear')

const ENV = { LINEAR_API_KEY: 'test-key', LINEAR_TEAM_KEY: 'sar' }

const STATES = [
  { id: 'state-todo', name: 'Todo', type: 'unstarted' },
  { id: 'state-progress', name: 'In Progress', type: 'started' },
  { id: 'state-review', name: 'In Review', type: 'started' },
]

const ISSUE = {
  id: 'issue-uuid',
  identifier: 'SAR-4',
  title: 'Wire the ticket rail to Linear',
  priority: 2,
  priorityLabel: 'High',
  url: 'https://linear.app/sarjy/issue/SAR-4',
  stateId: 'state-progress',
}

/** A fake team holding `issues`, as `client.teams()` returns it. */
function fakeTeam(issues: object[] = [ISSUE]) {
  const update = vi.fn().mockResolvedValue({ success: true })
  const team = {
    key: 'SAR',
    name: 'Sarjy',
    issues: vi.fn().mockResolvedValue({
      nodes: issues.map((issue) => ({ ...issue, update })),
      pageInfo: { hasNextPage: false },
    }),
    states: vi.fn().mockResolvedValue({ nodes: STATES }),
  }
  client.teams.mockResolvedValue({ nodes: [team] })
  return { team, update }
}

beforeEach(() => {
  client.teams.mockReset()
  client.createComment.mockReset().mockResolvedValue({ success: true })
})

describe('fetchStandupTasks', () => {
  it('returns the team and its open issues as tasks', async () => {
    const { team } = fakeTeam()

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
    expect(client.teams).toHaveBeenCalledWith({ filter: { key: { eqIgnoreCase: 'sar' } } })
    expect(team.issues).toHaveBeenCalledWith(
      expect.objectContaining({ filter: { state: { type: { nin: ['completed', 'canceled'] } } } }),
    )
  })

  it('reports a team key that matches no team', async () => {
    client.teams.mockResolvedValue({ nodes: [] })
    expect(await fetchStandupTasks(ENV)).toMatchObject({ ok: false, error: 'team_not_found' })
  })

  it('reports missing configuration without calling Linear', async () => {
    expect(await fetchStandupTasks({})).toMatchObject({ ok: false, error: 'not_configured' })
    expect(client.teams).not.toHaveBeenCalled()
  })

  it.each([
    ['a rejected key', new AuthenticationLinearError(), 'unauthorized'],
    ['a network failure', new NetworkLinearError(), 'network_error'],
    ['any other Linear error', new InvalidInputLinearError(), 'linear_error'],
  ])('reports %s', async (_case, error, code) => {
    client.teams.mockRejectedValue(error)
    expect(await fetchStandupTasks(ENV)).toMatchObject({ ok: false, error: code })
  })
})

describe('updateTask', () => {
  it('finds the issue by number on the team, then moves it and comments', async () => {
    const { team, update } = fakeTeam([{ ...ISSUE, identifier: 'SAR-12' }])

    const result = await updateTask(
      { identifier: 'SAR-12', status: 'in review', comment: 'Ready for review.' },
      ENV,
    )

    expect(result).toEqual({ ok: true, identifier: 'SAR-12', status: 'In Review' })
    expect(team.issues).toHaveBeenCalledWith({ first: 1, filter: { number: { eq: 12 } } })
    expect(update).toHaveBeenCalledWith({ stateId: 'state-review' })
    expect(client.createComment).toHaveBeenCalledWith({
      issueId: 'issue-uuid',
      body: 'Ready for review.\n\n— via Sarjy',
    })
  })

  it('refuses a ticket from another team without looking it up', async () => {
    const { team } = fakeTeam()
    const result = await updateTask({ identifier: 'ENG-1', status: 'Todo' }, ENV)
    expect(result).toMatchObject({ ok: false, error: 'task_not_found' })
    expect(team.issues).not.toHaveBeenCalled()
  })

  it('reports a ticket number that does not exist', async () => {
    fakeTeam([])
    const result = await updateTask({ identifier: 'SAR-999', status: 'Todo' }, ENV)
    expect(result).toMatchObject({ ok: false, error: 'task_not_found' })
  })

  it('refuses an unknown status, naming the valid ones, without writing', async () => {
    const { update } = fakeTeam()

    const result = await updateTask({ identifier: 'SAR-4', status: 'Shipped' }, ENV)

    expect(result).toMatchObject({ ok: false, error: 'unknown_status' })
    expect(!result.ok && result.message).toContain('Todo, In Progress, In Review')
    expect(update).not.toHaveBeenCalled()
    expect(client.createComment).not.toHaveBeenCalled()
  })
})
