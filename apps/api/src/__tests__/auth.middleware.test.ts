import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { SignJWT } from 'jose'

// Mock the DB layer so the middleware never touches a real database.
const findUnique = vi.fn()
vi.mock('../lib/prisma.js', () => ({
  prisma: { user: { findUnique } },
}))

const { requireAuth } = await import('../middleware/auth.js')
const { errorHandler } = await import('../middleware/error.js')
const { SESSION_COOKIE } = await import('../lib/cookies.js')

// Must match vitest.config.ts's JWT_SECRET (what lib/token.ts verifies against).
const secret = new TextEncoder().encode('test-secret-test-secret-test-secret')

/** Sign a session token whose `iat` is `ageSeconds` in the past. */
function tokenAged(ageSeconds: number, tv = 0): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ role: 'ADMIN', tv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('user-1')
    .setIssuedAt(now - ageSeconds)
    .setExpirationTime(now + 7 * 24 * 3600)
    .sign(secret)
}

function buildApp() {
  const app = express()
  app.use(cookieParser())
  app.get('/protected', requireAuth, (req, res) => res.json({ id: req.user!.id }))
  app.use(errorHandler)
  return app
}

const FAKE_USER = {
  id: 'user-1',
  username: 'ben',
  password: 'hash',
  firstName: 'Ben',
  surname: 'Alkureishi',
  avatarUrl: null,
  colour: '#3B82F6',
  dob: new Date('1990-01-01'),
  role: 'ADMIN',
  tokenVersion: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('requireAuth (network-aware sliding session)', () => {
  beforeEach(() => {
    findUnique.mockReset().mockResolvedValue(FAKE_USER)
  })

  it('rejects when no session cookie is present', async () => {
    const res = await request(buildApp()).get('/protected')
    expect(res.status).toBe(401)
  })

  it('accepts a fresh token from an external client and slides the cookie', async () => {
    const token = await tokenAged(60)
    const res = await request(buildApp())
      .get('/protected')
      .set('cf-connecting-ip', '8.8.8.8') // looks external
      .set('Cookie', `${SESSION_COOKIE}=${token}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('user-1')
    // Session is re-issued (slid) on every authenticated request.
    const setCookie = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? []
    expect(setCookie.join(';')).toContain(`${SESSION_COOKIE}=`)
  })

  it('rejects an idle-too-long token from an external client', async () => {
    const token = await tokenAged(30 * 60) // 30 min > 15 min external window
    const res = await request(buildApp())
      .get('/protected')
      .set('cf-connecting-ip', '8.8.8.8')
      .set('Cookie', `${SESSION_COOKIE}=${token}`)

    expect(res.status).toBe(401)
  })

  it('accepts the same idle token from the local network', async () => {
    const token = await tokenAged(30 * 60) // within the 7d local window
    const res = await request(buildApp())
      .get('/protected')
      .set('Cookie', `${SESSION_COOKIE}=${token}`) // loopback, no CF header → local

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('user-1')
  })

  it('rejects a token whose version is behind the user (password/role changed)', async () => {
    findUnique.mockResolvedValue({ ...FAKE_USER, tokenVersion: 1 })
    const token = await tokenAged(60, 0) // minted before the bump
    const res = await request(buildApp())
      .get('/protected')
      .set('Cookie', `${SESSION_COOKIE}=${token}`)

    expect(res.status).toBe(401)
  })
})
