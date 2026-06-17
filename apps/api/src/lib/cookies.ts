import { randomBytes } from 'node:crypto'
import type { CookieOptions, Response } from 'express'
import { CSRF_COOKIE } from '@hame/shared'
import { env } from './env.js'
import { parseDurationToSeconds } from './duration.js'

export const SESSION_COOKIE = 'hame_session'

const sessionMaxAgeMs = parseDurationToSeconds(env.JWT_REFRESH_EXPIRY) * 1000

const baseOptions: CookieOptions = {
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
}

/** httpOnly session cookie carrying the JWT. */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    ...baseOptions,
    httpOnly: true,
    maxAge: sessionMaxAgeMs,
  })
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { ...baseOptions, httpOnly: true })
}

/** Readable (non-httpOnly) cookie for the double-submit CSRF token. */
export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, {
    ...baseOptions,
    httpOnly: false,
    maxAge: sessionMaxAgeMs,
  })
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex')
}
