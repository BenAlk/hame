import type { RequestHandler } from 'express'
import { HttpError } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import { SESSION_COOKIE, setSessionCookie } from '../lib/cookies.js'
import { signSessionToken, verifySessionToken } from '../lib/token.js'
import { isLocalRequest } from '../lib/network.js'
import { parseDurationToSeconds } from '../lib/duration.js'
import { env } from '../lib/env.js'
import { toPublicUser } from '../services/user.service.js'

// Network-aware idle windows (precomputed once): on-LAN sessions sit idle far
// longer than off-LAN ones before re-auth is required. See spec §11.
const LOCAL_IDLE_SECONDS = parseDurationToSeconds(env.JWT_REFRESH_EXPIRY)
const EXTERNAL_IDLE_SECONDS = parseDurationToSeconds(env.JWT_ACCESS_EXPIRY)

/**
 * Authenticate via the session cookie. Verifies the JWT, enforces the
 * network-aware idle window against the token's `iat`, attaches the user to
 * `req.user`, then slides the session by re-issuing a fresh cookie.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined
    if (!token) throw HttpError.unauthorized()

    let claims
    try {
      claims = await verifySessionToken(token)
    } catch {
      throw HttpError.unauthorized()
    }

    // A device trusted at login gets the long window wherever it connects from;
    // everything else falls back to the network-aware choice.
    const idleWindow =
      isLocalRequest(req) || claims.trusted ? LOCAL_IDLE_SECONDS : EXTERNAL_IDLE_SECONDS
    const ageSeconds = Math.floor(Date.now() / 1000) - claims.iat
    if (ageSeconds > idleWindow) throw HttpError.unauthorized('Session expired')

    const user = await prisma.user.findUnique({ where: { id: claims.sub } })
    if (!user) throw HttpError.unauthorized()

    // Reject a token minted before the user's last password/role change (§11).
    if (claims.tv !== user.tokenVersion) throw HttpError.unauthorized('Session expired')

    req.user = toPublicUser(user)

    // Slide the session forward so active use never lapses within the window.
    const fresh = await signSessionToken({
      sub: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      trusted: claims.trusted,
    })
    setSessionCookie(res, fresh)

    next()
  } catch (err) {
    next(err)
  }
}

/** Require an authenticated ADMIN. Must be chained after {@link requireAuth}. */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(HttpError.unauthorized())
    return
  }
  if (req.user.role !== 'ADMIN') {
    next(HttpError.forbidden())
    return
  }
  next()
}
