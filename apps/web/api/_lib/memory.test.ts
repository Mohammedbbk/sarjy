import { beforeEach, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ getFacts: vi.fn(), saveFact: vi.fn() }))
const auth = vi.hoisted(() => ({ agentContext: vi.fn() }))
vi.mock('./memory-store.js', () => store)
vi.mock('./auth.js', () => auth)

const { GET: handleMemoryRequest } = await import('../memory.js')

const VISITOR = '11111111-1111-4111-8111-111111111111'

const bound = () => ({
  ok: true as const,
  visitorId: VISITOR,
  standupId: '22222222-2222-4222-8222-222222222222',
})

const refused = () => ({
  ok: false as const,
  status: 401,
  error: 'unauthorized' as const,
  message: 'This voice session is not bound to a stand-up.',
})

function request(method = 'GET', body?: string) {
  return handleMemoryRequest(
    new Request('https://example.com/api/memory', {
      method,
      headers: { Authorization: 'Bearer binding-token', 'X-Sarjy-Room': 'standup-abc' },
      body,
    }),
  )
}

beforeEach(() => {
  auth.agentContext.mockReset().mockResolvedValue(bound())
  store.getFacts.mockReset().mockResolvedValue({ ok: true, facts: [] })
  store.saveFact.mockReset().mockResolvedValue({
    ok: true,
    fact: { key: 'favorite_color', value: 'green', updated_at: 'now' },
  })
})

it.each(['GET', 'POST'])('fails closed for %s without a valid binding', async (method) => {
  auth.agentContext.mockResolvedValue(refused())

  const response = await request(method, method === 'POST' ? '{}' : undefined)

  expect(response.status).toBe(401)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(store.getFacts).not.toHaveBeenCalled()
  expect(store.saveFact).not.toHaveBeenCalled()
})

it('reads and writes facts for the bound visitor only', async () => {
  expect((await request()).status).toBe(200)
  expect(store.getFacts).toHaveBeenCalledWith(VISITOR)

  const written = await request('POST', JSON.stringify({ key: 'favorite_color', value: 'green' }))
  expect(written.status).toBe(200)
  expect(store.saveFact).toHaveBeenCalledWith(VISITOR, 'favorite_color', 'green')
})

it('reports a storage failure as a failure, never as an empty read', async () => {
  store.getFacts.mockResolvedValue({
    ok: false,
    error: 'database_error',
    message: 'Memory storage is unavailable.',
  })

  const response = await request()
  const body = (await response.json()) as { ok: boolean; error: string }

  expect(response.status).toBe(503)
  expect(body).toMatchObject({ ok: false, error: 'database_error' })
})

it('rejects unexpected fields and query parameters', async () => {
  const extra = await request('POST', JSON.stringify({ key: 'a', value: 'b', userId: 'someone' }))
  expect(extra.status).toBe(400)
  expect(store.saveFact).not.toHaveBeenCalled()

  const queried = await handleMemoryRequest(
    new Request('https://example.com/api/memory?user_id=someone', {
      headers: { Authorization: 'Bearer binding-token', 'X-Sarjy-Room': 'standup-abc' },
    }),
  )
  expect(queried.status).toBe(400)
})

it('refuses methods other than GET and POST, still authenticated', async () => {
  const response = await request('DELETE')
  expect(response.status).toBe(405)
  expect(response.headers.get('Allow')).toBe('GET, POST')
})
