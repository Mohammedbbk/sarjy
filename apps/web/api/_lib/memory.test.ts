import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ getFacts: vi.fn(), saveFact: vi.fn() }))
vi.mock('./memory-store.js', () => store)
const { handleMemoryRequest } = await import('./memory.js')

function request(method = 'GET', body?: string, token = 'test-token') {
  return handleMemoryRequest(
    new Request('https://example.com/api/memory', {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    }),
  )
}
beforeEach(() => {
  vi.stubEnv('MEMORY_API_TOKEN', 'test-token')
  store.getFacts.mockReset().mockResolvedValue({ ok: true, facts: [] })
  store.saveFact
    .mockReset()
    .mockResolvedValue({
      ok: true,
      fact: { key: 'favorite_color', value: 'green', updated_at: 'now' },
    })
})
afterEach(() => vi.unstubAllEnvs())

it.each(['GET', 'POST'])(
  'fails closed for %s with missing or invalid authentication',
  async (method) => {
    for (const token of ['', 'wrong-token']) {
      const response = await request(method, undefined, token)
      expect(response.status).toBe(401)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    }
    vi.stubEnv('MEMORY_API_TOKEN', '')
    expect((await request(method)).status).toBe(401)
    expect(store.getFacts).not.toHaveBeenCalled()
    expect(store.saveFact).not.toHaveBeenCalled()
  },
)

it('returns an authenticated empty read and confirmed write', async () => {
  const response = await request()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true, facts: [] })
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(
    (
      await request(
        'POST',
        JSON.stringify({ key: 'favorite_color', value: 'green' }),
      )
    ).status,
  ).toBe(200)
  expect(store.saveFact).toHaveBeenCalledWith('favorite_color', 'green')
})

it.each([
  'null',
  '[]',
  '{',
  '{"user_id":"other","key":"color","value":"green"}',
  '"hello"',
])('rejects malformed or identity-bearing bodies: %s', async (body) => {
  expect((await request('POST', body)).status).toBe(400)
  expect(store.saveFact).not.toHaveBeenCalled()
})

it('rejects unsupported methods and query identity', async () => {
  const response = await request('DELETE')
  expect(response.status).toBe(405)
  expect(response.headers.get('Allow')).toBe('GET, POST')
  expect(
    (
      await handleMemoryRequest(
        new Request('https://example.com/api/memory?user_id=other', {
          headers: { Authorization: 'Bearer test-token' },
        }),
      )
    ).status,
  ).toBe(400)
  expect(store.getFacts).not.toHaveBeenCalled()
})

it('returns database failures without claiming empty memory or successful saves', async () => {
  const failure = {
    ok: false,
    error: 'database_error',
    message: 'Memory storage is unavailable.',
  }
  store.getFacts.mockResolvedValue(failure)
  store.saveFact.mockResolvedValue(failure)
  for (const response of [
    await request(),
    await request('POST', '{"key":"color","value":"green"}'),
  ]) {
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual(failure)
  }
})
