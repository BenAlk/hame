import { describe, it, expect } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { CSRF_COOKIE, CSRF_HEADER } from '@hame/shared'
import { ensureCsrfCookie, verifyCsrf } from '../middleware/csrf.js'
import { errorHandler } from '../middleware/error.js'

function buildApp() {
  const app = express()
  app.use(cookieParser())
  app.use(ensureCsrfCookie)
  app.get('/read', (_req, res) => res.json({ ok: true }))
  app.post('/write', verifyCsrf, (_req, res) => res.json({ ok: true }))
  app.use(errorHandler)
  return app
}

describe('CSRF middleware', () => {
  it('issues a CSRF cookie when none is present', async () => {
    const res = await request(buildApp()).get('/read')
    const setCookie = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? []
    expect(setCookie.join(';')).toContain(`${CSRF_COOKIE}=`)
  })

  it('rejects a mutation with no CSRF header', async () => {
    const res = await request(buildApp()).post('/write').set('Cookie', `${CSRF_COOKIE}=abc123`)
    expect(res.status).toBe(403)
  })

  it('rejects a mutation when header and cookie disagree', async () => {
    const res = await request(buildApp())
      .post('/write')
      .set('Cookie', `${CSRF_COOKIE}=abc123`)
      .set(CSRF_HEADER, 'different')
    expect(res.status).toBe(403)
  })

  it('accepts a mutation when header matches the cookie', async () => {
    const res = await request(buildApp())
      .post('/write')
      .set('Cookie', `${CSRF_COOKIE}=abc123`)
      .set(CSRF_HEADER, 'abc123')
    expect(res.status).toBe(200)
  })
})
