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
  /** Issued-at, seconds since epoch — drives the network-aware idle check. */
  iat: number
}

/**
 * Sign a session JWT. `exp` is the hard cap (JWT_REFRESH_EXPIRY); the shorter
 * network-aware idle window is enforced separately against `iat` in requireAuth.
 */
export function signSessionToken(payload: { sub: string; role: Role }): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(env.JWT_REFRESH_EXPIRY)
    .sign(secret)
}

/** Verify signature + `exp`, returning typed claims. Throws on any invalid token. */
export async function verifySessionToken(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] })
  const { sub, role, iat } = payload
  if (typeof sub !== 'string' || typeof iat !== 'number' || !isRole(role)) {
    throw new Error('Malformed session token')
  }
  return { sub, role, iat }
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}
