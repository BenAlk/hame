import type { HouseholdSettings, UpdateHouseholdSettingsInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'

/** The household settings row is a singleton (spec §7.5), keyed by this id. */
const SINGLETON_ID = 'singleton'

/** Fetch the household settings, creating the default row on first access. */
export async function getHouseholdSettings(): Promise<HouseholdSettings> {
  const row = await prisma.householdSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })
  return { enabledMealTypes: row.enabledMealTypes, updatedAt: row.updatedAt }
}

export async function updateHouseholdSettings(
  input: UpdateHouseholdSettingsInput,
): Promise<HouseholdSettings> {
  const row = await prisma.householdSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { enabledMealTypes: input.enabledMealTypes },
    create: { id: SINGLETON_ID, enabledMealTypes: input.enabledMealTypes },
  })
  return { enabledMealTypes: row.enabledMealTypes, updatedAt: row.updatedAt }
}
