import { afterEach, expect, it, vi } from 'vitest'
import { getFacts, saveFact } from './memory-store.js'

const VISITOR = '11111111-1111-4111-8111-111111111111'

const { createClient, query } = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    upsert: vi.fn(),
    single: vi.fn(),
    abortSignal: vi.fn(),
  }
  return { createClient: vi.fn(), query }
})
vi.mock('@supabase/supabase-js', () => ({ createClient }))

function setup(data: unknown, error: unknown = null) {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-secret')
  for (const method of Object.values(query))
    method.mockReset().mockReturnValue(query)
  query.abortSignal.mockResolvedValue({ data, error })
  createClient
    .mockReset()
    .mockReturnValue({ from: vi.fn().mockReturnValue(query) })
}
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

it('reads this visitor’s facts with a bounded request', async () => {
  const facts = [
    {
      key: 'favorite_color',
      value: 'purple',
      updated_at: '2026-09-18T00:00:00Z',
    },
  ]
  setup(facts)
  expect(await getFacts(VISITOR)).toEqual({ ok: true, facts })
  expect(query.eq).toHaveBeenCalledWith('user_id', VISITOR)
  expect(query.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal))
})

it('distinguishes an empty table from database errors', async () => {
  setup([])
  expect(await getFacts(VISITOR)).toEqual({ ok: true, facts: [] })
  setup(null, { message: 'secret database detail' })
  expect(await getFacts(VISITOR)).toEqual({
    ok: false,
    error: 'database_error',
    message: 'Memory storage is unavailable.',
  })
  query.abortSignal.mockRejectedValue(new Error('secret network detail'))
  expect(await getFacts(VISITOR)).toMatchObject({ ok: false, error: 'database_error' })
})

it('upserts corrections on the same identity and key with a fresh timestamp', async () => {
  setup({ key: 'favorite_color', value: 'purple', updated_at: 'now' })
  query.abortSignal.mockReturnValue(query)
  query.single.mockResolvedValue({
    data: { key: 'favorite_color', value: 'purple', updated_at: 'now' },
    error: null,
  })
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-18T00:00:00Z'))
  expect(await saveFact(VISITOR, ' Favourite Colour ', ' purple ')).toMatchObject({
    ok: true,
  })
  expect(query.upsert).toHaveBeenLastCalledWith(
    {
      user_id: VISITOR,
      key: 'favorite_color',
      value: 'purple',
      updated_at: '2026-09-18T00:00:00.000Z',
    },
    { onConflict: 'user_id,key' },
  )
  vi.setSystemTime(new Date('2026-09-19T00:00:00Z'))
  await saveFact(VISITOR, 'favoriteColor', 'green')
  expect(query.upsert).toHaveBeenLastCalledWith(
    {
      user_id: VISITOR,
      key: 'favorite_color',
      value: 'green',
      updated_at: '2026-09-19T00:00:00.000Z',
    },
    { onConflict: 'user_id,key' },
  )
})

it.each([
  ['', 'purple'],
  ['color', '  '],
  ['bad.key', 'value'],
  ['a'.repeat(65), 'x'],
  ['color', 'x'.repeat(1001)],
  [null, 'x'],
])('rejects invalid input before database access', async (key, value) => {
  setup(null)
  expect(await saveFact(VISITOR, key, value)).toMatchObject({
    ok: false,
    error: 'invalid_input',
  })
  expect(createClient).not.toHaveBeenCalled()
})

it('reports missing config and failed writes', async () => {
  setup(null, { message: 'denied' })
  query.abortSignal.mockReturnValue(query)
  query.single.mockResolvedValue({ data: null, error: { message: 'denied' } })
  expect(await saveFact(VISITOR, 'favorite_color', 'purple')).toMatchObject({
    ok: false,
    error: 'database_error',
  })
  vi.stubEnv('SUPABASE_SECRET_KEY', '')
  expect(await getFacts(VISITOR)).toMatchObject({ ok: false, error: 'not_configured' })
})
