import { createHash, timingSafeEqual } from 'node:crypto'

export function hasBearerToken(request: Request, expected: string | undefined): boolean {
  const token = expected?.trim()
  const header = request.headers.get('Authorization') ?? ''
  const match = /^Bearer ([^\s]+)$/i.exec(header)
  if (!token || !match) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(token), digest(match[1]!))
}
