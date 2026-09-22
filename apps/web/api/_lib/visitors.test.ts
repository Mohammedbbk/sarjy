import { describe, expect, it } from 'vitest'
import {
  COOKIE_NAME,
  cookieHeader,
  hasAllowedOrigin,
  hashCredential,
  mintCredential,
  readCookie,
  wantsSecureCookie,
} from './visitors.js'

describe('credentials', () => {
  it('mints a long, url-safe, unguessable credential', () => {
    const credential = mintCredential()
    expect(credential).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(credential).not.toBe(mintCredential())
  })

  it('stores only a hash, so a leaked row cannot be replayed as a cookie', () => {
    const credential = mintCredential()
    const hash = hashCredential(credential)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(credential)
    expect(hashCredential(credential)).toBe(hash)
  })
})

describe('reading the cookie', () => {
  it('finds the credential among other cookies', () => {
    expect(readCookie(`other=1; ${COOKIE_NAME}=abcdefghijklmnop; last=2`)).toBe(
      'abcdefghijklmnop',
    )
  })

  it('treats a missing or malformed value as absent', () => {
    expect(readCookie(null)).toBeNull()
    expect(readCookie('other=1')).toBeNull()
    expect(readCookie(`${COOKIE_NAME}=short`)).toBeNull()
    expect(readCookie(`${COOKIE_NAME}=abcdefghijklmnop';drop table--`)).toBeNull()
  })
})

describe('writing the cookie', () => {
  it('is host-only, HttpOnly and SameSite=Lax', () => {
    const header = cookieHeader('credential-value', true)
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('Secure')
    expect(header).toContain('Path=/')
    expect(header).not.toContain('Domain=')
  })

  it('drops Secure only for plain-HTTP localhost, where it would be discarded', () => {
    expect(wantsSecureCookie(new Request('http://localhost:5180/api/tasks'))).toBe(false)
    expect(wantsSecureCookie(new Request('http://127.0.0.1:5180/api/tasks'))).toBe(false)
    expect(wantsSecureCookie(new Request('https://sarjy.example.com/api/tasks'))).toBe(true)
    expect(wantsSecureCookie(new Request('http://sarjy.example.com/api/tasks'))).toBe(true)
  })
})

describe('cross-site protection', () => {
  const url = 'https://sarjy.example.com/api/workflow'

  it('accepts a same-origin request', () => {
    expect(
      hasAllowedOrigin(
        new Request(url, { method: 'POST', headers: { Origin: 'https://sarjy.example.com' } }),
      ),
    ).toBe(true)
  })

  it('refuses another site’s origin', () => {
    for (const origin of ['https://evil.example.com', 'null', 'http://sarjy.example.com.evil.com']) {
      expect(hasAllowedOrigin(new Request(url, { method: 'POST', headers: { Origin: origin } }))).toBe(
        false,
      )
    }
  })

  it('allows a request that sends no Origin at all', () => {
    expect(hasAllowedOrigin(new Request(url, { method: 'POST' }))).toBe(true)
  })
})
