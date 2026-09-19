import { afterEach, expect, it, vi } from 'vitest';
import { updateTask } from './task-updates.ts';

afterEach(() => vi.unstubAllGlobals());

it('posts the update with the token and relays the backend result', async () => {
  const fetchMock = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>(async () =>
    Response.json({ ok: true, identifier: 'SAR-12', status: 'In Review' }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const env = { SARJY_API_URL: 'http://localhost:5173', MEMORY_API_TOKEN: 'token' };

  const result = await updateTask({ identifier: 'SAR-12', status: 'In Review' }, env);

  expect(result).toEqual({ ok: true, identifier: 'SAR-12', status: 'In Review' });
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url.toString()).toBe('http://localhost:5173/api/task-updates');
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token');
});

it('reports failure instead of throwing', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
  const env = { SARJY_API_URL: 'http://localhost:5173', MEMORY_API_TOKEN: 'token' };
  await expect(updateTask({ identifier: 'SAR-12' }, env)).resolves.toMatchObject({ ok: false });
});
