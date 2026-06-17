import type { RequestHandler } from 'express'
import { CSRF_COOKIE, CSRF_HEADER } from '@hame/shared'
import { HttpError } from '../lib/http-error.js'
import { generateCsrfToken, setCsrfCookie } from '../lib/cookies.js'

/**
 * Ensure a readable CSRF cookie exists on every request so the client always
 * has a token to echo back. Mounted app-wide before the routes.
 */
export const ensureCsrfCookie: RequestHandler = (req, res, next) => {
  if (!req.cookies?.[CSRF_COOKIE]) {
    setCsrfCookie(res, generateCsrfToken())
  }
  next()
}

/**
 * Double-submit CSRF check for authenticated state-changing routes: the
 * `x-csrf-token` header must match the CSRF cookie. Login & setup are exempt
 * (no session yet; covered by rate-limiting + credentials).
 */
export const verifyCsrf: RequestHandler = (req, _res, next) => {
  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined
  const headerToken = req.get(CSRF_HEADER)
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    next(HttpError.forbidden('Invalid CSRF token'))
    return
  }
  next()
}
