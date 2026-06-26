import type { Prisma } from '@prisma/client'
import type { DashboardLayout, UpdateDashboardLayoutInput } from '@hame/shared'
import { DEFAULT_DASHBOARD, DashboardLayoutSchema } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HOUSEHOLD_ID, whereForOwner, type DashboardOwner } from '../lib/dashboard-owner.js'

/**
 * Per-owner dashboard layouts (spec §8.12, §10 Phase 7.1). A dashboard owner is
 * either a User (their personal dashboard) or the shared household/tablet — the
 * latter stored as the single fixed-id row. An owner with no saved row gets
 * {@link DEFAULT_DASHBOARD}, so a new user and a fresh clone need no setup.
 *
 * Layout/widgets are JSON validated by `DashboardLayoutSchema` on the way in and
 * re-parsed on the way out, so a hand-edited row can't break the dashboard.
 */

// Re-exported for callers/tests that reach for the owner model via this service.
export { HOUSEHOLD_ID, type DashboardOwner }

function whereFor(owner: DashboardOwner): Prisma.DashboardLayoutWhereUniqueInput {
  return whereForOwner(owner)
}

function toLayout(row: { layout: unknown; widgets: unknown }): DashboardLayout {
  // Defensive parse — the row was validated on write, but a manual DB edit
  // shouldn't be able to ship a broken layout to the grid.
  return DashboardLayoutSchema.parse({ layout: row.layout, widgets: row.widgets })
}

/** The owner's saved layout, or the shared default when they haven't customised. */
export async function getDashboardLayout(owner: DashboardOwner): Promise<DashboardLayout> {
  const row = await prisma.dashboardLayout.findUnique({ where: whereFor(owner) })
  return row ? toLayout(row) : DEFAULT_DASHBOARD
}

/** Save (upsert) the owner's layout wholesale. */
export async function saveDashboardLayout(
  owner: DashboardOwner,
  input: UpdateDashboardLayoutInput,
): Promise<DashboardLayout> {
  const layout = input.layout as Prisma.InputJsonValue
  const widgets = input.widgets as unknown as Prisma.InputJsonValue
  const create =
    owner.kind === 'household'
      ? { id: HOUSEHOLD_ID, isHousehold: true, layout, widgets }
      : { userId: owner.userId, layout, widgets }
  const row = await prisma.dashboardLayout.upsert({
    where: whereFor(owner),
    update: { layout, widgets },
    create,
  })
  return toLayout(row)
}
