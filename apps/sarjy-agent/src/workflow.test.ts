import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindingFromMetadata, WorkflowClient } from './workflow.ts';

const binding = {
  apiBase: 'https://sarjy.test',
  room: 'room-1',
  token: 'secret-binding-token',
};

const snapshot = {
  standupId: 'standup-1',
  stage: 'review',
  revision: 2,
  doc: {
    coverage: { review: 'unasked', blockers: 'unasked', today: 'unasked' },
    progress: [],
    blockers: [],
    commitments: [],
    unresolvedReferences: [],
  },
  startedAt: '2026-09-22T00:00:00Z',
  finishedAt: null,
  summary: null,
};

const context = {
  ok: true,
  snapshot,
  tasks: { ok: true, teamKey: 'SAR', done: [], inProgress: [], upcoming: [], statusNames: ['Todo', 'Done'] },
  memory: { ok: true, facts: [] },
  lastSummary: { ok: true, summary: null },
  actions: { ok: true, actions: [] },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => vi.restoreAllMocks());

describe('room-bound workflow client', () => {
  it('reads the server dispatch binding and uses the fallback API origin', () => {
    const metadata = JSON.stringify({ bindingToken: 'x'.repeat(32), room: 'room-1' });
    expect(bindingFromMetadata(metadata, 'https://fallback.test')).toEqual({
      apiBase: 'https://fallback.test',
      room: 'room-1',
      token: 'x'.repeat(32),
    });
    expect(() => bindingFromMetadata('{}', binding.apiBase)).toThrow();
  });

  it('rejects a malformed task, memory, or action response rather than treating it as empty', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ ...context, tasks: { ok: true, done: [] } }))
      .mockResolvedValueOnce(json({ ...context, memory: { ok: true, facts: 'none' } }))
      .mockResolvedValueOnce(json({ ...context, actions: { ok: true, actions: 'none' } }));
    const client = new WorkflowClient(binding);

    expect(await client.context()).toMatchObject({ ok: false, error: 'invalid_response' });
    expect(await client.context()).toMatchObject({ ok: false, error: 'invalid_response' });
    expect(await client.context()).toMatchObject({ ok: false, error: 'invalid_response' });
  });

  it('sends the room binding and latest revision with a command', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(context))
      .mockResolvedValueOnce(json({ ok: true, snapshot: { ...snapshot, revision: 3 } }));
    const client = new WorkflowClient(binding);

    expect((await client.context()).ok).toBe(true);
    const result = await client.command({ type: 'declare_none', section: 'blockers' });
    expect(result.ok && result.snapshot.revision).toBe(3);

    const [, init] = fetchMock.mock.calls[1]!;
    expect(new Headers(init?.headers).get('X-Sarjy-Room')).toBe(binding.room);
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${binding.token}`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      expectedRevision: 2,
      command: { type: 'declare_none', section: 'blockers' },
    });
  });

  it('retries a lost response with the same request id and payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(context))
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockResolvedValueOnce(json({ ok: true, snapshot: { ...snapshot, revision: 3 } }));
    const client = new WorkflowClient(binding);

    await client.context();
    expect((await client.command({ type: 'skip', section: 'today' })).ok).toBe(true);

    const first = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body));
    const retry = JSON.parse(String(fetchMock.mock.calls[2]![1]?.body));
    expect(retry).toEqual(first);
    expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('serializes simultaneous updates so each uses the latest saved revision', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(context))
      .mockResolvedValueOnce(json({ ok: true, snapshot: { ...snapshot, revision: 3 } }))
      .mockResolvedValueOnce(json({ ok: true, snapshot: { ...snapshot, revision: 4 } }));
    const client = new WorkflowClient(binding);

    await client.context();
    const results = await Promise.all([
      client.command({ type: 'capture', section: 'review', entries: [{ text: 'First update' }] }),
      client.command({ type: 'capture', section: 'review', entries: [{ text: 'Second update' }] }),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).expectedRevision).toBe(2);
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]?.body)).expectedRevision).toBe(3);
  });

  it('waits for a pending save before refreshing the progress list', async () => {
    let finishSave!: (response: Response) => void;
    const delayedSave = new Promise<Response>((resolve) => { finishSave = resolve; });
    const latest = { ...snapshot, revision: 3, doc: {
      ...snapshot.doc,
      progress: [{ id: 'entry-1', text: 'Fixed login', issueId: null }],
    } };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(context))
      .mockReturnValueOnce(delayedSave)
      .mockResolvedValueOnce(json({ ...context, snapshot: latest }));
    const client = new WorkflowClient(binding);
    await client.context();
    const saving = client.command({ type: 'capture', section: 'review', entries: [{ text: 'Fixed login' }] });
    const reading = client.context();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    finishSave(json({ ok: true, snapshot: latest }));
    await saving;
    expect(await reading).toMatchObject({ ok: true, snapshot: { revision: 3, doc: { progress: [{ text: 'Fixed login' }] } } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not let a delayed refresh overwrite a newer save revision', async () => {
    let finishRead!: (response: Response) => void;
    const delayedRead = new Promise<Response>((resolve) => { finishRead = resolve; });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(context))
      .mockReturnValueOnce(delayedRead)
      .mockResolvedValueOnce(json({ ok: true, snapshot: { ...snapshot, revision: 3 } }));
    const client = new WorkflowClient(binding);
    await client.context();
    const reading = client.context();
    const saving = client.command({ type: 'declare_none', section: 'blockers' });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    finishRead(json(context));
    await reading;
    expect(await saving).toMatchObject({ ok: true, snapshot: { revision: 3 } });
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]?.body)).expectedRevision).toBe(2);
  });

  it('reports an unknown outcome after two lost responses', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(context))
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockRejectedValueOnce(new TypeError('connection lost'));
    const client = new WorkflowClient(binding);

    await client.context();
    const result = await client.command({ type: 'capture', section: 'review', entries: [{ text: 'Shipped' }] });
    expect(result).toMatchObject({ ok: false, error: 'outcome_unknown' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('updates its cached revision after a conflict without repeating the command', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(context))
      .mockResolvedValueOnce(json({
        ok: false,
        error: 'stale_revision',
        message: 'The stand-up changed.',
        snapshot: { ...snapshot, revision: 5 },
      }, 409))
      .mockResolvedValueOnce(json({ ok: true, snapshot: { ...snapshot, revision: 6 } }));
    const client = new WorkflowClient(binding);

    await client.context();
    expect(await client.command({ type: 'skip', section: 'today' })).toMatchObject({
      ok: false,
      error: 'stale_revision',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await client.command({ type: 'declare_none', section: 'blockers' });
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]?.body)).expectedRevision).toBe(5);
  });

  it('validates memory responses and does not claim an uncertain save succeeded', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ ok: true, facts: 'invalid' }))
      .mockRejectedValueOnce(new TypeError('connection lost'));
    const client = new WorkflowClient(binding);

    expect(await client.memory()).toMatchObject({ ok: false, error: 'invalid_response' });
    expect(await client.remember('favorite_color', 'purple')).toMatchObject({
      ok: false,
      error: 'outcome_unknown',
    });
  });

  it('submits one proposal with a stable action id across a lost response', async () => {
    const action = { id: '11111111-1111-4111-8111-111111111111', status: 'proposed', kind: 'comment', body: 'Shipped referral' };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockResolvedValueOnce(json({ ok: true, action }));
    const client = new WorkflowClient(binding);

    expect((await client.propose({ entryId: 'entry-1', issueId: 'issue-1', kind: 'comment', body: 'Shipped referral' })).ok).toBe(true);
    expect(fetchMock.mock.calls[0]![0].toString()).toContain('/api/agent-actions');
    const first = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toEqual(first);
    expect(first.actionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('waits for an in-flight saved update before sending its proposal', async () => {
    let finishSave!: (response: Response) => void;
    const delayedSave = new Promise<Response>((resolve) => { finishSave = resolve; });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(context))
      .mockReturnValueOnce(delayedSave)
      .mockResolvedValueOnce(json({ ok: true, action: { id: 'a', status: 'proposed', kind: 'comment', body: 'Ready' } }));
    const client = new WorkflowClient(binding);
    await client.context();
    const saving = client.command({ type: 'capture', section: 'review', entries: [{ text: 'Ready' }] });
    const proposing = client.propose({ entryId: 'entry-1', issueId: 'issue-1', kind: 'comment', body: 'Ready' });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    finishSave(json({ ok: true, snapshot: { ...snapshot, revision: 3 } }));
    await Promise.all([saving, proposing]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});


describe('new ticket proposals', () => {
  it('sends a create proposal without inventing an existing ticket id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      ok: true, action: { id: 'proposal', kind: 'create', status: 'proposed' },
    }));
    const client = new WorkflowClient(binding);
    expect(await client.propose({ entryId: 'entry', kind: 'create', title: 'Magic link registration', body: 'Register and log in using a magic link.' }))
      .toMatchObject({ ok: true, action: { kind: 'create', status: 'proposed' } });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({ kind: 'create', title: 'Magic link registration' });
    expect(body.issueId).toBeUndefined();
  });
});
