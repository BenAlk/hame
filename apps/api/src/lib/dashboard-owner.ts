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

/**
 * Resolve the owner a request targets from `?owner=`: `household` for the shared
 * wall-tablet row, `me`/omitted for the signed-in user. Member-level either way —
 * the tablet is shared (spec §10 Phase 7.1). Throws 400 on a bad value, 401 when
 * a user owner can't be identified.
 */
export function resolveOwner(req: Request): DashboardOwner {
  const owner = req.query.owner
  if (owner === 'household') return { kind: 'household' }
  if (owner !== undefined && owner !== 'me') {
    throw HttpError.badRequest('owner must be "me" or "household"')
  }
  const userId = req.user?.id
  if (!userId) throw HttpError.unauthorized()
  return { kind: 'user', userId }
}
