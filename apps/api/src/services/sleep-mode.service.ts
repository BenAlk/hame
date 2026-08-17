import type { SleepModeSettings, UpdateSleepModeSettingsInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'

/** The sleep-mode settings row is a singleton (spec §10 Phase 26), keyed by this id. */
const SINGLETON_ID = 'singleton'

/**
 * Fetch the household sleep-mode schedule, creating the default row (off, spec
 * §7.8 defaults set in the schema) on first access. Member-level read so the
 * wall tablet can apply it without an admin session.
 */
export async function getSleepModeSettings(): Promise<SleepModeSettings> {
  return prisma.sleepModeSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })
}

/** Update the household sleep-mode schedule (admin-only at the route). */
export async function updateSleepModeSettings(
  input: UpdateSleepModeSettingsInput,
): Promise<SleepModeSettings> {
  return prisma.sleepModeSettings.upsert({
    where: { id: SINGLETON_ID },
    update: input,
    create: { id: SINGLETON_ID, ...input },
  })
}
