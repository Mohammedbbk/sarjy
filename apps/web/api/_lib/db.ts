import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import process from 'node:process'

const TIMEOUT_MS = 5_000

export type DbResult<T> = { ok: true; data: T } | DbFailure

export type DbFailure = {
  ok: false
  error: 'not_configured' | 'storage_unavailable'
  message: string
}

let cached: SupabaseClient | null | undefined

function client(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const url = process.env.SUPABASE_URL?.trim()
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
  cached = url && secret
    ? createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null
  return cached
}

// for tests
export function resetDbClient(): void {
  cached = undefined
}

export const notConfigured = (): DbFailure => ({
  ok: false,
  error: 'not_configured',
  message: 'Storage is not configured on this server.',
})

export const unavailable = (): DbFailure => ({
  ok: false,
  error: 'storage_unavailable',
  message: 'Storage is unavailable.',
})

// Calls a sarjy_* function from the visitor_workflow migration. Network errors
// return storage_unavailable instead of empty data.
export async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<DbResult<T>> {
  const db = client()
  if (!db) return notConfigured()
  try {
    const { data, error } = await db
      .rpc(name, args)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS))
    if (error) {
      console.error(`[db] ${name} failed: ${error.message}`)
      return unavailable()
    }
    return { ok: true, data: data as T }
  } catch (error) {
    console.error(`[db] ${name} threw:`, error)
    return unavailable()
  }
}
