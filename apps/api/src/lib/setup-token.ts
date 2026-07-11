import { randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * First-run setup token (spec §8.1).
 *
 * The first-run wizard (`POST /api/setup`) creates the initial admin while no
 * user exists — an open window a publicly-reachable instance could have claimed
 * by whoever loads /setup first. To close that land-grab we mint a one-time
 * token at boot (when the DB has no users), print it to the server logs, and
 * require the operator to echo it back through the wizard. Whoever controls the
 * container controls the account.
 *
 * The token lives in memory only: no DB row, no migration, and a restart mid-
 * setup simply mints a fresh one (re-read the logs). Once the admin is created
 * it is cleared, and the `userCount > 0` guard makes the wizard unreachable
 * regardless.
 */

let currentToken: string | null = null

/** Mint (or replace) the token and return it. Called once on first-run boot. */
export function generateSetupToken(): string {
  currentToken = randomBytes(18).toString('base64url')
  return currentToken
}

/** The active token, or null when none is outstanding (setup already done). */
export function getSetupToken(): string | null {
  return currentToken
}

/**
 * Constant-time check of a candidate against the active token. Returns false
 * when no token is outstanding, so a completed instance never accepts one.
 */
export function verifySetupToken(candidate: string): boolean {
  if (!currentToken) return false
  const expected = Buffer.from(currentToken)
  const actual = Buffer.from(candidate)
  // timingSafeEqual throws on length mismatch — guard first (the length itself
  // isn't secret: the token is a fixed 24-char base64url string).
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

/** Invalidate the token once setup has completed. */
export function clearSetupToken(): void {
  currentToken = null
}
