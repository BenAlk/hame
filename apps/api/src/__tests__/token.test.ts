import { describe, it, expect } from 'vitest'
import { signSessionToken, verifySessionToken } from '../lib/token.js'

describe('session token', () => {
  it('round-trips claims', async () => {
    const token = await signSessionToken({ sub: 'user-1', role: 'ADMIN' })
    const claims = await verifySessionToken(token)
    expect(claims.sub).toBe('user-1')
    expect(claims.role).toBe('ADMIN')
    expect(typeof claims.iat).toBe('number')
  })

  it('rejects a tampered token', async () => {
    const token = await signSessionToken({ sub: 'user-1', role: 'MEMBER' })
    await expect(verifySessionToken(token + 'x')).rejects.toThrow()
  })

  it('rejects a non-token string', async () => {
    await expect(verifySessionToken('garbage')).rejects.toThrow()
  })
})
