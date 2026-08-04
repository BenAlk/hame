import { describe, it, expect } from 'vitest'
import { SignJWT } from 'jose'
import { signSessionToken, verifySessionToken } from '../lib/token.js'

describe('session token', () => {
  it('round-trips claims', async () => {
    const token = await signSessionToken({
      sub: 'user-1',
      role: 'ADMIN',
      tokenVersion: 3,
      trusted: true,
    })
    const claims = await verifySessionToken(token)
    expect(claims.sub).toBe('user-1')
    expect(claims.role).toBe('ADMIN')
    expect(claims.tv).toBe(3)
    expect(claims.trusted).toBe(true)
    expect(typeof claims.iat).toBe('number')
  })

  it('treats a token minted without the trusted claim as untrusted', async () => {
    // A session issued before the claim existed must still verify, not 401.
    const legacy = await new SignJWT({ role: 'MEMBER', tv: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode('test-secret-test-secret-test-secret'))

    const claims = await verifySessionToken(legacy)
    expect(claims.trusted).toBe(false)
  })

  it('rejects a tampered token', async () => {
    const token = await signSessionToken({
      sub: 'user-1',
      role: 'MEMBER',
      tokenVersion: 0,
      trusted: false,
    })
    await expect(verifySessionToken(token + 'x')).rejects.toThrow()
  })

  it('rejects a non-token string', async () => {
    await expect(verifySessionToken('garbage')).rejects.toThrow()
  })
})
