import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStandupTasks } from './tasks.ts';

const ENV = { SARJY_API_URL: 'http://localhost:5173' };

const TASK = {
  id: '9f1c2d3e-0000-4000-8000-aaaaaaaaaaaa',
  identifier: 'SAR-4',
  title: 'Wire the ticket rail to Linear',
  status: 'In Progress',
  statusType: 'started',
  priority: 2,
  priorityLabel: 'High',
  url: 'https://linear.app/sarjy/issue/SAR-4',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(step: Response | Error) {
  const fetchMock = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>(async () => {
    if (step instanceof Error) throw step;
    return step;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchStandupTasks — success', () => {
  it('returns the backend’s tasks and calls the endpoint with no parameters', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        source: 'linear',
        teamKey: 'SAR',
        done: [],
        inProgress: [TASK],
        upcoming: [],
        openCount: 1,
        hasMore: true,
      }),
    );

    const result = await fetchStandupTasks(ENV);

    expect(result).toEqual({
      ok: true,
      teamKey: 'SAR',
      done: [],
      inProgress: [TASK],
      upcoming: [],
      openCount: 1,
      hasMore: true,
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url.toString()).toBe('http://localhost:5173/api/tasks');
    expect(url.search).toBe('');
  });

  it('bounds the request with an abort signal', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        source: 'linear',
        teamKey: 'SAR',
        done: [],
        inProgress: [],
        upcoming: [],
        openCount: 0,
        hasMore: false,
      }),
    );

    await fetchStandupTasks(ENV);

    expect(fetchMock.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('fetchStandupTasks — empty results', () => {
  it('treats no open tickets as success, not failure', async () => {
    mockFetch(
      jsonResponse({
        source: 'linear',
        teamKey: 'SAR',
        done: [],
        inProgress: [],
        upcoming: [],
        openCount: 0,
        hasMore: false,
      }),
    );

    const result = await fetchStandupTasks(ENV);

    expect(result).toEqual({
      ok: true,
      teamKey: 'SAR',
      done: [],
      inProgress: [],
      upcoming: [],
      openCount: 0,
      hasMore: false,
    });
  });
});

describe('fetchStandupTasks — failures', () => {
  it('reports a missing SARJY_API_URL without calling anything', async () => {
    const fetchMock = mockFetch(jsonResponse({}));

    const result = await fetchStandupTasks({});

    expect(result).toMatchObject({ ok: false, error: 'not_configured' });
    if (result.ok) return;
    expect(result.message).toContain('SARJY_API_URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a malformed SARJY_API_URL', async () => {
    mockFetch(jsonResponse({}));

    const result = await fetchStandupTasks({ SARJY_API_URL: 'not a url' });

    expect(result).toMatchObject({ ok: false, error: 'not_configured' });
  });

  it.each([
    ['server_not_configured', 500],
    ['upstream_unavailable', 503],
    ['upstream_error', 502],
  ])('passes through the backend’s %s code', async (code, status) => {
    mockFetch(jsonResponse({ error: code, message: 'Linear took too long to respond.' }, status));

    const result = await fetchStandupTasks(ENV);

    expect(result).toEqual({
      ok: false,
      error: code,
      message: 'Linear took too long to respond.',
    });
  });

  it('falls back to http_error for an unrecognised failure body', async () => {
    mockFetch(new Response('<html>502 Bad Gateway</html>', { status: 502 }));

    const result = await fetchStandupTasks(ENV);

    expect(result).toMatchObject({ ok: false, error: 'http_error' });
    if (result.ok) return;
    expect(result.message).toContain('502');
  });

  it('rejects a 200 whose body does not match the contract', async () => {
    mockFetch(jsonResponse({ source: 'linear', teamKey: 'SAR', tasks: 'nope' }));

    const result = await fetchStandupTasks(ENV);

    expect(result).toMatchObject({ ok: false, error: 'invalid_response' });
  });

  it('rejects a task that is missing contract fields', async () => {
    mockFetch(
      jsonResponse({
        source: 'linear',
        teamKey: 'SAR',
        count: 1,
        hasMore: false,
        tasks: [{ id: 'uuid', identifier: 'SAR-1' }],
      }),
    );

    const result = await fetchStandupTasks(ENV);

    expect(result).toMatchObject({ ok: false, error: 'invalid_response' });
  });

  it('reports a network failure', async () => {
    mockFetch(new TypeError('fetch failed'));

    const result = await fetchStandupTasks(ENV);

    expect(result).toMatchObject({ ok: false, error: 'network_error' });
  });

  it('reports a timeout', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    mockFetch(timeout);

    const result = await fetchStandupTasks(ENV);

    expect(result).toMatchObject({ ok: false, error: 'timeout' });
  });
});
