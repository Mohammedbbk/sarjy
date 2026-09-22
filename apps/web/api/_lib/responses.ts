import type { WorkflowFailure, WorkflowResult } from '../../shared/workflow.js'
import type { AuthFailure } from './auth.js'
import { json } from './http.js'
import { cookieHeader, wantsSecureCookie, type Visitor } from './visitors.js'

const STATUS: Record<WorkflowFailure['error'], number> = {
  unauthorized: 401,
  not_found: 404,
  stale_revision: 409,
  invalid_transition: 409,
  unresolved_reference: 422,
  invalid_input: 400,
  at_capacity: 503,
  storage_unavailable: 503,
}

export function visitorHeaders(request: Request, visitor: Visitor): Record<string, string> {
  return visitor.isNew
    ? { 'Set-Cookie': cookieHeader(visitor.credential, wantsSecureCookie(request)) }
    : {}
}

export function authError(failure: AuthFailure): Response {
  return json(failure.status, { ok: false, error: failure.error, message: failure.message })
}

// failures include the snapshot when there is one, so the client can skip a refetch
export function workflowResponse(
  result: WorkflowResult,
  headers: Record<string, string> = {},
): Response {
  if (result.ok) return json(200, { ok: true, snapshot: result.snapshot }, headers)
  return json(
    STATUS[result.error],
    {
      ok: false,
      error: result.error,
      message: result.message,
      ...(result.snapshot ? { snapshot: result.snapshot } : {}),
    },
    headers,
  )
}

export function badRequest(message: string): Response {
  return json(400, { ok: false, error: 'invalid_input', message })
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = await request.text()
    if (raw.length > 8192) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

// requestId has to come from the caller, otherwise retries can't be deduped
export function readEnvelope(
  body: Record<string, unknown>,
): { expectedRevision: number; requestId: string } | null {
  const revision = body.expectedRevision
  const requestId = body.requestId
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) return null
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_:-]{8,128}$/.test(requestId)) return null
  return { expectedRevision: revision, requestId }
}
