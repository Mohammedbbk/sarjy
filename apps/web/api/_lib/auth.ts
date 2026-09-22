import { createHash } from 'node:crypto'
import { rpc } from './db.js'
import { hasAllowedOrigin, resolveVisitor, type Visitor } from './visitors.js'

export type AuthFailure = {
  ok: false
  status: number
  error: 'unauthorized' | 'at_capacity' | 'storage_unavailable' | 'not_configured'
  message: string
}

export type BrowserContext = {
  ok: true
  visitor: Visitor
}

export async function browserContext(
  request: Request,
  options: { mutating?: boolean } = {},
): Promise<BrowserContext | AuthFailure> {
  if (options.mutating && !hasAllowedOrigin(request)) {
    return { ok: false, status: 403, error: 'unauthorized', message: 'Cross-site request refused.' }
  }

  const resolved = await resolveVisitor(request)
  if (!resolved.ok) {
    if (resolved.error === 'at_capacity') {
      return { ok: false, status: 503, error: 'at_capacity', message: resolved.message }
    }
    return {
      ok: false,
      status: resolved.error === 'not_configured' ? 500 : 503,
      error: resolved.error,
      message: resolved.message,
    }
  }

  return { ok: true, visitor: resolved.visitor }
}

export type AgentContext = {
  ok: true
  visitorId: string
  standupId: string
}

type BindingResponse =
  | { status: 'ok'; visitorId: string; standupId: string }
  | { status: 'rejected' }


export async function agentContext(request: Request): Promise<AgentContext | AuthFailure> {
  const room = request.headers.get('X-Sarjy-Room')?.trim()
  const header = request.headers.get('Authorization') ?? ''
  const match = /^Bearer ([^\s]+)$/i.exec(header)

  const refused: AuthFailure = {
    ok: false,
    status: 401,
    error: 'unauthorized',
    message: 'This voice session is not bound to a stand-up.',
  }
  if (!room || !match) return refused

  const resolved = await rpc<BindingResponse>('sarjy_resolve_binding', {
    p_room_name: room,
    p_token_hash: createHash('sha256').update(match[1]!).digest('hex'),
  })
  if (!resolved.ok) {
    return { ok: false, status: 503, error: 'storage_unavailable', message: resolved.message }
  }
  if (resolved.data.status !== 'ok') return refused

  return {
    ok: true,
    visitorId: resolved.data.visitorId,
    standupId: resolved.data.standupId,
  }
}
