import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const updateTask = vi.hoisted(() => vi.fn())
vi.mock('./linear.js', () => ({ updateTask }))

const { POST: handleTaskUpdateRequest } = await import('../task-updates.js')

function post(body: unknown, token = 'test-token') {
  return handleTaskUpdateRequest(
    new Request('https://example.com/api/task-updates', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  vi.stubEnv('MEMORY_API_TOKEN', 'test-token')
  vi.stubEnv('LINEAR_WRITES_ENABLED', 'true')
  updateTask.mockReset().mockResolvedValue({ ok: true, identifier: 'SAR-12', status: 'In Review' })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllEnvs())

it('passes a valid update to Linear and returns the result', async () => {
  const response = await post({ identifier: 'SAR-12', status: 'In Review', comment: 'Ready.' })

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true, identifier: 'SAR-12', status: 'In Review' })
  expect(updateTask).toHaveBeenCalledWith({
    identifier: 'SAR-12',
    status: 'In Review',
    comment: 'Ready.',
  })
})

it('rejects a wrong token and does nothing while writes are off', async () => {
  expect((await post({ identifier: 'SAR-12', status: 'Done' }, 'wrong')).status).toBe(401)
  vi.stubEnv('LINEAR_WRITES_ENABLED', 'false')
  expect((await post({ identifier: 'SAR-12', status: 'Done' })).status).toBe(403)
  expect(updateTask).not.toHaveBeenCalled()
})

it('rejects a request with nothing to change', async () => {
  expect((await post({ identifier: 'SAR-12' })).status).toBe(400)
  expect((await post({ identifier: 'not an id', status: 'Done' })).status).toBe(400)
  expect(updateTask).not.toHaveBeenCalled()
})
