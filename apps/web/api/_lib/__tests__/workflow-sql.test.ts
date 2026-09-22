import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_DOC, canRunIntegrationTests, connect, lockSchema, resetSchema, rpc, unlockSchema } from './database.js'

const suite = canRunIntegrationTests ? describe : describe.skip
type Snapshot = { standupId: string; revision: number; stage: string; doc: typeof EMPTY_DOC }

suite('simplified workflow SQL', () => {
  let db: Client
  beforeAll(async () => { db = await connect(); await lockSchema(db) })
  beforeEach(async () => resetSchema(db))
  afterAll(async () => { await unlockSchema(db); await db.end() })

  async function visitor(hash: string) {
    const result = await rpc<{ status: string; visitor: { id: string } }>(db, 'sarjy_claim_visitor', [hash, 30, 20])
    return result.visitor.id
  }
  async function open(visitorId: string) {
    return rpc<{ status: string; resumed: boolean; snapshot: Snapshot }>(db, 'sarjy_open_standup', [visitorId, EMPTY_DOC])
  }

  it('resumes one active stand-up for a visitor', async () => {
    const id = await visitor('same-browser')
    const first = await open(id); const second = await open(id)
    expect(second.snapshot.standupId).toBe(first.snapshot.standupId)
    expect(second.resumed).toBe(true)
  })

  it('isolates stand-ups between visitors', async () => {
    const first = await open(await visitor('one'))
    const other = await visitor('two')
    expect(await rpc(db, 'sarjy_read_standup', [other, first.snapshot.standupId])).toBeNull()
  })

  it('lets only one writer win a revision and replays its request id', async () => {
    const id = await visitor('writer'); const opened = await open(id)
    const commit = (requestId: string) => rpc<{ status: string; snapshot: Snapshot }>(db, 'sarjy_commit_command', [id, opened.snapshot.standupId, 0, requestId, 'blockers', { ...EMPTY_DOC, coverage: { ...EMPTY_DOC.coverage, review: 'captured' } }])
    const [a, b] = await Promise.all([commit('11111111-1111-4111-8111-111111111111'), commit('22222222-2222-4222-8222-222222222222')])
    expect([a.status, b.status].sort()).toEqual(['ok', 'stale'])
    const winner = a.status === 'ok' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222'
    const replay = await rpc<{ status: string; snapshot: Snapshot }>(db, 'sarjy_commit_command', [id, opened.snapshot.standupId, 0, winner, 'today', EMPTY_DOC])
    expect(replay.status).toBe('replayed'); expect(replay.snapshot.revision).toBe(1)
  })

  it('requires complete coverage and no ambiguity before finishing', async () => {
    const id = await visitor('finish'); const opened = await open(id)
    const incomplete = await rpc<{ status: string }>(db, 'sarjy_finish_standup', [id, opened.snapshot.standupId, 0, '33333333-3333-4333-8333-333333333333', {}])
    expect(incomplete.status).toBe('incomplete')
  })

  it('resolves room bindings only with the matching secret hash', async () => {
    const id = await visitor('voice'); const opened = await open(id)
    expect(await rpc(db, 'sarjy_bind_room', [id, opened.snapshot.standupId, 'room', 'hash', new Date(Date.now() + 60_000)])).toBe(true)
    expect(await rpc<{ status: string }>(db, 'sarjy_resolve_binding', ['room', 'wrong'])).toMatchObject({ status: 'rejected' })
    expect(await rpc<{ status: string; visitorId: string }>(db, 'sarjy_resolve_binding', ['room', 'hash'])).toMatchObject({ status: 'ok', visitorId: id })
    await rpc(db, 'sarjy_bind_room', [id, opened.snapshot.standupId, 'replacement', 'new-hash', new Date(Date.now() + 60_000)])
    expect(await rpc<{ status: string }>(db, 'sarjy_resolve_binding', ['room', 'hash'])).toMatchObject({ status: 'rejected' })
  })
})
