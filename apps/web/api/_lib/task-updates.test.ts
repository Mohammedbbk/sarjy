import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { handleTaskUpdateRequest } from './task-updates'

const ISSUE = {
  id: 'issue-uuid',
  identifier: 'SAR-12',
  state: { name: 'In Progress' },
  team: { states: { nodes: [{ id: 'state-review', name: 'In Review' }] } },
}

function post(body: unknown, token = 'test-token') {
  return handleTaskUpdateRequest(
    new Request('https://example.com/api/task-updates', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  )
}

/** Fake Linear: answers the issue lookup, then accepts any mutation. */
function fakeLinear(issues: unknown[] = [ISSUE]) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const { query } = JSON.parse(init.body as string) as { query: string }
    const data = query.includes('SarjyFindIssue') ? { issues: { nodes: issues } } : { success: true }
    return Response.json({ data })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.stubEnv('MEMORY_API_TOKEN', 'test-token')
  vi.stubEnv('LINEAR_WRITES_ENABLED', 'true')
  vi.stubEnv('LINEAR_API_KEY', 'lin-key')
  vi.stubEnv('LINEAR_TEAM_KEY', 'sar')
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('moves a ticket and comments on it', async () => {
  const fetchMock = fakeLinear()
  const response = await post({ identifier: 'SAR-12', status: 'in review', comment: 'Ready.' })

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true, identifier: 'SAR-12', status: 'In Review' })
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

it('rejects a wrong token and does nothing while writes are off', async () => {
  const fetchMock = fakeLinear()
  expect((await post({ identifier: 'SAR-12', status: 'In Review' }, 'wrong')).status).toBe(401)
  vi.stubEnv('LINEAR_WRITES_ENABLED', 'false')
  expect((await post({ identifier: 'SAR-12', status: 'In Review' })).status).toBe(403)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('refuses tickets from another team and unknown statuses without writing', async () => {
  const fetchMock = fakeLinear()
  expect(await (await post({ identifier: 'ENG-1', status: 'In Review' })).json()).toMatchObject({
    error: 'task_not_found',
  })
  const body = await (await post({ identifier: 'SAR-12', status: 'Shipped' })).json()
  expect(body).toMatchObject({ error: 'unknown_status', message: expect.stringContaining('In Review') })
  expect(fetchMock).toHaveBeenCalledTimes(1) // only the lookup, no mutation
})
