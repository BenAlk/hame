import type { Request } from 'express'
import { HttpError } from './http-error.js'

/**
 * A dashboard "owner" (spec §10 Phase 7.1, 7.1b): a specific User (their personal
 * surface) or the shared household/tablet (the wall tablet, spec §8.14). Used by
 * any per-owner surface — the dashboard layout and the smart-home control list —
 * so they resolve and key the owner identically.
 */
export type DashboardOwner = { kind: 'user'; userId: string } | { kind: 'household' }

/** Fixed primary key of the single shared household/tablet row (per table). */
export const HOUSEHOLD_ID = 'household'

/**
 * Prisma `where` for the owner's row. Structurally valid for any per-owner table
 * whose household row is keyed by {@link HOUSEHOLD_ID} and whose user rows have a
 * unique `userId` (DashboardLayout, SmartHomeSettings).
 */
export function whereForOwner(owner: DashboardOwner): { id: string } | { userId: string } {
  return owner.kind === 'household' ? { id: HOUSEHOLD_ID } : { userId: owner.userId }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolve the owner a request targets from `?owner=`: `household` for the shared
 * wall-tablet row, `me`/omitted for the signed-in user, or a specific user id.
 *
 * A specific user id is only honoured when `allowOtherUser` is set — reads pass it
 * so the shared wall tablet can page through **any** member's dashboard, while
 * writes leave it off, so a request can only ever save the caller's own row or the
 * household one. That asymmetry is the whole "view everyone, edit only your own"
 * gate (spec §8.1, §10 Phase 7.1). Throws 400 on a malformed value, 403 on an
 * attempt to write another user's row, 401 when a user owner can't be identified.
 */
export function resolveOwner(
  req: Request,
  { allowOtherUser = false }: { allowOtherUser?: boolean } = {},
): DashboardOwner {
  const owner = req.query.owner
  if (owner === 'household') return { kind: 'household' }

  const selfId = req.user?.id
  if (owner === undefined || owner === 'me') {
    if (!selfId) throw HttpError.unauthorized()
    return { kind: 'user', userId: selfId }
  }
  if (typeof owner !== 'string') {
    throw HttpError.badRequest('owner must be "me", "household", or a user id')
  }

  // A specific user id. On a write path (allowOtherUser off) only the caller's own
  // id is permitted; anything else is a forbidden cross-user write.
  if (!allowOtherUser) {
    if (!selfId) throw HttpError.unauthorized()
    if (owner === selfId) return { kind: 'user', userId: selfId }
    throw HttpError.forbidden('You can only change your own dashboard')
  }
  if (!UUID_RE.test(owner)) throw HttpError.badRequest('owner must be a valid user id')
  return { kind: 'user', userId: owner }
}
