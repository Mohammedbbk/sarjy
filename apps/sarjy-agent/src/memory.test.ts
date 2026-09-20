import { afterEach, expect, it, vi } from 'vitest';
import { fetchMemory, rememberFact } from './memory.ts';

const env = { SARJY_API_URL: 'http://localhost:5173', MEMORY_API_TOKEN: 'test-token' };
const fact = { key: 'favorite_color', value: 'purple', updated_at: '2026-09-18T00:00:00Z' };
afterEach(() => vi.unstubAllGlobals());

it('reads saved facts with backend authentication and a deadline', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, facts: [fact] }));
  vi.stubGlobal('fetch', fetch);
  expect(await fetchMemory(env)).toEqual({ ok: true, facts: [fact] });
  expect(fetch).toHaveBeenCalledWith(
    new URL('http://localhost:5173/api/memory'),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      signal: expect.any(AbortSignal),
      redirect: 'error',
    }),
  );
});

it('distinguishes empty memory from a read failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true, facts: [] })));
  expect(await fetchMemory(env)).toEqual({ ok: true, facts: [] });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret detail')));
  expect(await fetchMemory(env)).toMatchObject({ ok: false });
});

it('does not acknowledge a save until confirmed', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: false }, { status: 503 })));
  expect(await rememberFact('favorite_color', 'purple', env)).toMatchObject({ ok: false });
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, fact }));
  vi.stubGlobal('fetch', fetch);
  expect(await rememberFact('favorite_color', 'purple', env)).toEqual({ ok: true, fact });
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
    key: 'favorite_color',
    value: 'purple',
  });
});

it('fails closed with missing configuration and rejects malformed responses', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ facts: [] }));
  vi.stubGlobal('fetch', fetch);
  expect(await fetchMemory({ SARJY_API_URL: env.SARJY_API_URL })).toMatchObject({ ok: false });
  expect(fetch).not.toHaveBeenCalled();
  expect(await fetchMemory(env)).toMatchObject({ ok: false });
});

it('reports timeouts, invalid URLs, and rejected saves without leaking details', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new DOMException('sensitive detail', 'TimeoutError')),
  );
  const result = await rememberFact('favorite_color', 'purple', env);
  expect(result).toMatchObject({ ok: false, message: 'The fact could not be saved.' });
  expect(JSON.stringify(result)).not.toContain('sensitive detail');
  expect(await fetchMemory({ ...env, SARJY_API_URL: 'not a URL' })).toMatchObject({ ok: false });
  expect(
    await fetchMemory({ ...env, SARJY_API_URL: 'http://production.example.com' }),
  ).toMatchObject({ ok: false });
});
