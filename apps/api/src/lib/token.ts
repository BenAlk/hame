import { SignJWT, jwtVerify } from 'jose'
import type { Role } from '@hame/shared'
import { ROLES } from '@hame/shared'
import { env } from './env.js'

const secret = new TextEncoder().encode(env.JWT_SECRET)
const ALG = 'HS256'

export interface SessionClaims {
  /** User id (JWT `sub`). */
  sub: string
  role: Role
  /** Token version — must match the user's current `tokenVersion` (§11). */
  tv: number
  /**
   * Device trusted at login — grants the long idle window off-LAN as well as on
   * (§11). Absent on tokens minted before this claim existed, hence `false`.
   */
  trusted: boolean
  /** Issued-at, seconds since epoch — drives the network-aware idle check. */
  iat: number
}

/**
 * Sign a session JWT. `exp` is the hard cap (JWT_REFRESH_EXPIRY); the shorter
 * network-aware idle window is enforced separately against `iat` in requireAuth.
 * `tv` carries the user's `tokenVersion` so a password/role change can revoke it.
 */
export function signSessionToken(payload: {
  sub: string
  role: Role
  tokenVersion: number
  trusted: boolean
}): Promise<string> {
  return new SignJWT({ role: payload.role, tv: payload.tokenVersion, trusted: payload.trusted })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(env.JWT_REFRESH_EXPIRY)
    .sign(secret)
}

/** Verify signature + `exp`, returning typed claims. Throws on any invalid token. */
export async function verifySessionToken(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] })
  const { sub, role, tv, trusted, iat } = payload
  if (
    typeof sub !== 'string' ||
    typeof iat !== 'number' ||
    typeof tv !== 'number' ||
    !isRole(role)
  ) {
    throw new Error('Malformed session token')
  }
  // Tolerate a missing `trusted` (a session issued before the claim existed):
  // treat it as untrusted rather than rejecting an otherwise valid token.
  return { sub, role, tv, trusted: trusted === true, iat }
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}
