
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { fileURLToPath } from 'node:url'

const MIGRATIONS = [
  '../../../../../supabase/migrations/202609210001_visitor_workflow.sql',
  '../../../../../supabase/migrations/202609220001_linear_actions.sql',
].map((path) => fileURLToPath(new URL(path, import.meta.url)))

export const DATABASE_URL = process.env.SARJY_TEST_DATABASE_URL ?? ''

/** Only databases that say "test" in their name. A misaimed run destroys data. */
export function isDisposable(url: string): boolean {
  if (!url) return false
  try {
    const name = new URL(url).pathname.replace(/^\//, '')
    return /test/i.test(name)
  } catch {
    return false
  }
}

export const canRunIntegrationTests = isDisposable(DATABASE_URL)

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  return client
}

const SCHEMA_LOCK = 'sarjy_test_schema'

export async function lockSchema(client: Client): Promise<void> {
  await client.query('select pg_advisory_lock(hashtext($1))', [SCHEMA_LOCK])
}

export async function unlockSchema(client: Client): Promise<void> {
  await client.query('select pg_advisory_unlock(hashtext($1))', [SCHEMA_LOCK])
}

/**
 * Rebuild the schema from the shipped migrations.
 *
 * The three Supabase roles are created first when they are missing, so the
 * migration's conditional privilege branches actually execute here. Without them
 * the `anon` / `authenticated` revokes and the `service_role` grants would be
 * skipped, and the tests asserting them would prove nothing.
 */
export async function resetSchema(client: Client): Promise<void> {
  for (const role of SUPABASE_ROLES) {
    await client.query(
      `do $$ begin
         if not exists (select 1 from pg_roles where rolname = '${role}') then
           create role ${role} nologin;
         end if;
       end $$`,
    )
  }
  await client.query('drop schema if exists public cascade')
  await client.query('create schema public')
  for (const migration of MIGRATIONS) await client.query(readFileSync(migration, 'utf8'))
}

/** The roles Supabase provides, which the migration's privilege block targets. */
export const SUPABASE_ROLES = ['anon', 'authenticated', 'service_role'] as const

/** Call a `sarjy_*` function the way `db.ts` does, and return its jsonb result. */
export async function rpc<T>(
  client: Client,
  name: string,
  args: unknown[],
): Promise<T> {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(', ')
  const { rows } = await client.query(`select public.${name}(${placeholders}) as result`, args)
  return rows[0].result as T
}

export const EMPTY_DOC = {
  coverage: { review: 'unasked', blockers: 'unasked', today: 'unasked' },
  progress: [],
  blockers: [],
  commitments: [],
  unresolvedReferences: [],
}
