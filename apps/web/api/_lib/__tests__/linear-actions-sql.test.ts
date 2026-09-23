import type { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_DOC, canRunIntegrationTests, connect, lockSchema, resetSchema, rpc, unlockSchema } from './database.js'

const suite = canRunIntegrationTests ? describe : describe.skip
const issueId = randomUUID()
const entryId = randomUUID()
const doc = { ...EMPTY_DOC, coverage: { ...EMPTY_DOC.coverage, review: 'captured' }, progress: [{ id: entryId, text: 'Finished referral', issueId }] }

suite('Linear action SQL', () => {
  let db: Client
  beforeAll(async () => { db = await connect(); await lockSchema(db) })
  beforeEach(async () => resetSchema(db))
  afterAll(async () => { await unlockSchema(db); await db.end() })

  async function open(hash: string) {
    const visitor = await rpc<{ visitor: { id: string } }>(db, 'sarjy_claim_visitor', [hash, 30, 20])
    const opened = await rpc<{ snapshot: { standupId: string } }>(db, 'sarjy_open_standup', [visitor.visitor.id, doc])
    return { visitorId: visitor.visitor.id, standupId: opened.snapshot.standupId }
  }

  async function propose(visitorId: string, standupId: string, actionId = randomUUID()) {
    return rpc<{ status: string; action?: { id: string; status: string } }>(db, 'sarjy_propose_action', [
      visitorId, standupId, actionId, entryId, issueId, 'SAR-1', 'Referral', 'https://linear.app/example',
      'comment', 'Shipped referral', null, null, null, null,
    ])
  }

  it('isolates proposals and allows only one approval claim', async () => {
    const owner = await open('owner')
    const other = await open('other')
    const actionId = randomUUID()
    expect((await propose(owner.visitorId, owner.standupId, actionId)).status).toBe('ok')
    expect((await propose(owner.visitorId, owner.standupId, actionId)).status).toBe('replayed')
    expect(await rpc(db, 'sarjy_list_actions', [other.visitorId, owner.standupId])).toEqual([])
    expect((await rpc<{ status: string }>(db, 'sarjy_claim_action', [other.visitorId, actionId])).status).toBe('not_found')
    const second = await connect()
    const [a, b] = await Promise.all([
      rpc<{ status: string }>(db, 'sarjy_claim_action', [owner.visitorId, actionId]),
      rpc<{ status: string }>(second, 'sarjy_claim_action', [owner.visitorId, actionId]),
    ])
    await second.end()
    expect([a.status, b.status].sort()).toEqual(['applying', 'claimed'])
    expect((await rpc<{ status: string }>(db, 'sarjy_record_action_result', [actionId, 'succeeded', 'Posted'])).status).toBe('succeeded')
    expect((await rpc<{ status: string }>(db, 'sarjy_claim_action', [owner.visitorId, actionId])).status).toBe('succeeded')
  })

  it('invalidates a proposal when its saved update changes', async () => {
    const owner = await open('corrected')
    const actionId = randomUUID()
    await propose(owner.visitorId, owner.standupId, actionId)
    const changed = { ...doc, progress: [{ id: entryId, text: 'Referral still needs review', issueId }] }
    await rpc(db, 'sarjy_commit_command', [owner.visitorId, owner.standupId, 0, randomUUID(), 'review', changed])
    expect(await rpc<{ status: string }[]>(db, 'sarjy_list_actions', [owner.visitorId, owner.standupId])).toMatchObject([{ status: 'invalidated' }])
    await rpc(db, 'sarjy_commit_command', [owner.visitorId, owner.standupId, 1, randomUUID(), 'review', doc])
    expect(await rpc<{ status: string }[]>(db, 'sarjy_list_actions', [owner.visitorId, owner.standupId])).toMatchObject([{ status: 'invalidated' }])
    expect((await rpc<{ status: string }>(db, 'sarjy_claim_action', [owner.visitorId, actionId])).status).toBe('invalidated')
  })

  it('rejects a proposal for an entry linked to a different issue', async () => {
    const owner = await open('wrong-issue')
    const result = await rpc<{ status: string }>(db, 'sarjy_propose_action', [
      owner.visitorId, owner.standupId, randomUUID(), entryId, randomUUID(), 'OTHER-1', 'Other', 'https://linear.app/example',
      'status', null, 'old', 'Todo', 'new', 'Done',
    ])
    expect(result.status).toBe('invalid_entry')
  })

  it('rejects a proposal when the saved entry has no ticket at all', async () => {
    const owner = await open('no-ticket')
    const unlinked = { ...doc, progress: [{ id: entryId, text: 'General note', issueId: null }] }
    await rpc(db, 'sarjy_commit_command', [owner.visitorId, owner.standupId, 0, randomUUID(), 'review', unlinked])
    expect((await propose(owner.visitorId, owner.standupId)).status).toBe('invalid_entry')
  })

  it('keeps action rows and mutation functions inaccessible to browser database roles', async () => {
    const { rows } = await db.query(`select
      (select relrowsecurity from pg_class where oid = 'public.linear_actions'::regclass) as rls,
      has_table_privilege('anon', 'public.linear_actions', 'SELECT') as anon_read,
      has_function_privilege('authenticated', 'public.sarjy_claim_action(uuid, uuid)', 'EXECUTE') as browser_claim`)
    expect(rows[0]).toMatchObject({ rls: true, anon_read: false, browser_claim: false })
  })

  it('keeps recent action receipts visible after a new stand-up begins', async () => {
    const owner = await open('returning')
    const actionId = randomUUID()
    await propose(owner.visitorId, owner.standupId, actionId)
    const complete = { ...doc, coverage: { review: 'captured', blockers: 'explicit_none', today: 'explicit_none' } }
    await rpc(db, 'sarjy_commit_command', [owner.visitorId, owner.standupId, 0, randomUUID(), 'confirm', complete])
    await rpc(db, 'sarjy_finish_standup', [owner.visitorId, owner.standupId, 1, randomUUID(), {}])
    const next = await rpc<{ snapshot: { standupId: string } }>(db, 'sarjy_open_standup', [owner.visitorId, EMPTY_DOC])
    expect(next.snapshot.standupId).not.toBe(owner.standupId)
    expect(await rpc<{ id: string }[]>(db, 'sarjy_list_actions', [owner.visitorId, null])).toMatchObject([{ id: actionId }])
  })
})
