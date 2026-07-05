import type { HouseholdSettings, UpdateHouseholdSettingsInput } from '@hame/shared'
import type { HouseholdSettings as HouseholdSettingsRow } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

/** The household settings row is a singleton (spec §7.5), keyed by this id. */
const SINGLETON_ID = 'singleton'

function toSettings(row: HouseholdSettingsRow): HouseholdSettings {
  return {
    enabledMealTypes: row.enabledMealTypes,
    ingredientNormaliser: row.ingredientNormaliser,
    caldavEnabled: row.caldavEnabled,
    autoConsumableCadence: row.autoConsumableCadence,
    updatedAt: row.updatedAt,
  }
}

/** Fetch the household settings, creating the default row on first access. */
export async function getHouseholdSettings(): Promise<HouseholdSettings> {
  const row = await prisma.householdSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })
  return toSettings(row)
}

export async function updateHouseholdSettings(
  input: UpdateHouseholdSettingsInput,
): Promise<HouseholdSettings> {
  const data = {
    ...(input.enabledMealTypes !== undefined && { enabledMealTypes: input.enabledMealTypes }),
    ...(input.ingredientNormaliser !== undefined && {
      ingredientNormaliser: input.ingredientNormaliser,
    }),
    ...(input.caldavEnabled !== undefined && { caldavEnabled: input.caldavEnabled }),
    ...(input.autoConsumableCadence !== undefined && {
      autoConsumableCadence: input.autoConsumableCadence,
    }),
  }
  const row = await prisma.householdSettings.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  })
  return toSettings(row)
}
