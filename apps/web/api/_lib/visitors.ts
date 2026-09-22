import { createHash, randomBytes } from 'node:crypto'
import process from 'node:process'
import { rpc, type DbFailure } from './db.js'

export const COOKIE_NAME = 'sarjy_visitor'

const TTL_DAYS = 30
// the db enforces this limit
const DEFAULT_CAPACITY = 20

export type Visitor = {
  id: string
  isNew: boolean
  credential: string
}

function capacity(): number {
  const configured = Number.parseInt(process.env.SARJY_VISITOR_CAPACITY ?? '', 10)
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_CAPACITY
}

export function mintCredential(): string {
  return randomBytes(32).toString('base64url')
}

// only this hash is stored, never the raw cookie value
export function hashCredential(credential: string): string {
  return createHash('sha256').update(credential).digest('hex')
}

export function readCookie(header: string | null): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name !== COOKIE_NAME) continue
    const value = rest.join('=')
    return /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : null
  }
  return null
}

export function cookieHeader(credential: string, secure: boolean): string {
  return [
    `${COOKIE_NAME}=${credential}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${TTL_DAYS * 24 * 60 * 60}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

// browsers drop Secure cookies on http://localhost
export function wantsSecureCookie(request: Request): boolean {
  const url = new URL(request.url)
  if (url.protocol === 'https:') return true
  return !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

export function hasAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin')
  // curl and some same-origin GETs don't send Origin
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

type ClaimResponse =
  | { status: 'ok'; visitor: { id: string } }
  | { status: 'at_capacity' }

export type VisitorResult =
  | { ok: true; visitor: Visitor }
  | { ok: false; error: 'at_capacity'; message: string }
  | DbFailure

export async function resolveVisitor(request: Request): Promise<VisitorResult> {
  const existing = readCookie(request.headers.get('Cookie'))
  const credential = existing ?? mintCredential()

  const claimed = await rpc<ClaimResponse>('sarjy_claim_visitor', {
    p_credential_hash: hashCredential(credential),
    p_ttl_days: TTL_DAYS,
    p_capacity: capacity(),
  })
  if (!claimed.ok) return claimed

  if (claimed.data.status === 'at_capacity') {
    return {
      ok: false,
      error: 'at_capacity',
      message: 'This demo is handing out its last workspaces. Try again later.',
    }
  }

  return {
    ok: true,
    visitor: {
      id: claimed.data.visitor.id,
      isNew: existing === null,
      credential,
    },
  }
}
