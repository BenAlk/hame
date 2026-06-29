import type { IdleModeSettings, UpdateIdleModeSettingsInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'

/** The idle-mode settings row is a singleton (spec §10 Phase 7.3), keyed by this id. */
const SINGLETON_ID = 'singleton'

/**
 * Fetch the household idle/screensaver settings, creating the default row (the
 * spec §7.8 defaults, set in the schema) on first access. Member-level read so
 * the wall tablet can apply them without an admin session.
 */
export async function getIdleModeSettings(): Promise<IdleModeSettings> {
  return prisma.idleModeSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })
}

/** Update the household idle settings (admin-only at the route). */
export async function updateIdleModeSettings(
  input: UpdateIdleModeSettingsInput,
): Promise<IdleModeSettings> {
  return prisma.idleModeSettings.upsert({
    where: { id: SINGLETON_ID },
    update: input,
    create: { id: SINGLETON_ID, ...input },
  })
}
