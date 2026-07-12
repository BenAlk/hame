import { randomBytes } from 'node:crypto'

/** Unambiguous charset (no 0/o/1/l) for a human-readable generated password. */
const CHARSET = 'abcdefghijkmnpqrstuvwxyz23456789'

/**
 * A grouped, readable password, e.g. `abcde-fghij-klmnp-qrstu` (20 chars from an
 * unambiguous alphabet, ~99 bits). Used for credentials a human copies once — a
 * CalDAV app password (spec §10 Phase 5.5) or the wall-tablet account (§8.1).
 */
export function generateReadablePassword(): string {
  const bytes = randomBytes(20)
  const chars = Array.from(bytes, (b) => CHARSET[b % CHARSET.length])
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join('')).join('-')
}
