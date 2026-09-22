// user_id is the visitor id (it used to be 'demo-user' for everyone).
// Old shared rows are left as-is and never copied to new visitors.
import { createClient } from '@supabase/supabase-js'
import process from 'node:process'

const TIMEOUT_MS = 5_000
export type Fact = { key: string; value: string; updated_at: string }
export type MemoryFailure = {
  ok: false
  error: 'invalid_input' | 'not_configured' | 'database_error'
  message: string
}
type Result<T> = ({ ok: true } & T) | MemoryFailure

export function validateFact(
  key: unknown,
  value: unknown,
): { key: string; value: string } | null {
  if (typeof key !== 'string' || typeof value !== 'string') return null
  let normalized = key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  normalized = normalized
    .replace(/favourite/g, 'favorite')
    .replace(/colour/g, 'color')
  const trimmed = value.trim()
  if (
    !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(normalized) ||
    normalized.length > 64 ||
    !trimmed ||
    trimmed.length > 1000
  )
    return null
  return { key: normalized, value: trimmed }
}

function client() {
  const url = process.env.SUPABASE_URL?.trim()
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secret) return null
  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

const unavailable = (): MemoryFailure => ({
  ok: false,
  error: 'database_error',
  message: 'Memory storage is unavailable.',
})
const notConfigured = (): MemoryFailure => ({
  ok: false,
  error: 'not_configured',
  message: 'Memory storage is not configured.',
})

export async function getFacts(visitorId: string): Promise<Result<{ facts: Fact[] }>> {
  try {
    const db = client()
    if (!db) return notConfigured()
    const { data, error } = await db
      .from('memory_facts')
      .select('key,value,updated_at')
      .eq('user_id', visitorId)
      .order('key')
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS))
    if (error || !data) return unavailable()
    return { ok: true, facts: data as Fact[] }
  } catch {
    return unavailable()
  }
}

export async function saveFact(
  visitorId: string,
  key: unknown,
  value: unknown,
): Promise<Result<{ fact: Fact }>> {
  const input = validateFact(key, value)
  if (!input)
    return {
      ok: false,
      error: 'invalid_input',
      message:
        'Use a snake_case key (1–64 characters) and a nonempty value (1–1000 characters).',
    }
  try {
    const db = client()
    if (!db) return notConfigured()
    const { data, error } = await db
      .from('memory_facts')
      .upsert(
        {
          user_id: visitorId,
          ...input,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,key' },
      )
      .select('key,value,updated_at')
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS))
      .single()
    if (error || !data) return unavailable()
    return { ok: true, fact: data as Fact }
  } catch {
    return unavailable()
  }
}
