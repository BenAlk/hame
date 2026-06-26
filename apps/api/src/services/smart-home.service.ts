import type { HaEntityState, SmartHomeSettings, UpdateSmartHomeSettingsInput } from '@hame/shared'
import { isControllableDomain } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HOUSEHOLD_ID, whereForOwner, type DashboardOwner } from '../lib/dashboard-owner.js'
import { haClient } from '../integrations/home-assistant/client.js'

/**
 * An owner's curated smart-home controls (spec §8.12, §10 Phase 6.3, 7.1b). A
 * per-owner list of HA entity ids the Smart-home widget renders — selection only,
 * never the live state (§8.11). Owners are the dashboard owners (a user or the
 * shared household/tablet), so each member curates their own dashboard's widget
 * and the wall tablet has its own. Member-level: either household member can
 * curate the household list, since the tablet is shared.
 *
 * `knownEntityIds` is the "already offered" set behind the dashboard's new-device
 * prompt, tracked per owner: seeded once (per owner) to whatever HA exposes when
 * that owner first opens the prompt, then any controllable entity *not* in it (nor
 * already on the widget) surfaces as a suggestion — so adding a bulb later asks
 * "add this?" without nagging about the devices that were there all along.
 */

interface SettingsRow {
  entityIds: string[]
  knownEntityIds: string[]
  knownInitialised: boolean
}

function toSettings(row: { entityIds: string[] }): SmartHomeSettings {
  return { entityIds: row.entityIds }
}

/** The current controllable entities from the in-memory registry (live, §8.11). */
function controllableEntities(): HaEntityState[] {
  return haClient.getEntities().filter((e) => isControllableDomain(e.domain))
}

async function getRow(owner: DashboardOwner): Promise<SettingsRow> {
  const create =
    owner.kind === 'household' ? { id: HOUSEHOLD_ID, isHousehold: true } : { userId: owner.userId }
  return prisma.smartHomeSettings.upsert({
    where: whereForOwner(owner),
    update: {},
    create,
  })
}

/** Fetch the owner's curated list, creating the empty default row on first access. */
export async function getSmartHomeSettings(owner: DashboardOwner): Promise<SmartHomeSettings> {
  return toSettings(await getRow(owner))
}

/** Replace the owner's curated list wholesale; selected ids also join "known". */
export async function updateSmartHomeSettings(
  owner: DashboardOwner,
  input: UpdateSmartHomeSettingsInput,
): Promise<SmartHomeSettings> {
  const entityIds = [...new Set(input.entityIds)]
  const current = await getRow(owner)
  const row = await prisma.smartHomeSettings.update({
    where: whereForOwner(owner),
    data: { entityIds, knownEntityIds: [...new Set([...current.knownEntityIds, ...entityIds])] },
  })
  return toSettings(row)
}

/**
 * New controllable devices to offer this owner (the dashboard prompt). On the
 * first call after HA is connected, seeds the owner's `knownEntityIds` to the
 * current devices as the baseline and returns nothing — so only devices added
 * *later* are suggested. Returns [] when HA isn't connected / the registry is empty.
 */
export async function getSmartHomeSuggestions(owner: DashboardOwner): Promise<HaEntityState[]> {
  const controllable = controllableEntities()
  if (controllable.length === 0) return [] // HA not connected / not yet seeded

  const row = await getRow(owner)
  if (!row.knownInitialised) {
    await prisma.smartHomeSettings.update({
      where: whereForOwner(owner),
      data: { knownEntityIds: controllable.map((e) => e.entityId), knownInitialised: true },
    })
    return []
  }

  const seen = new Set([...row.knownEntityIds, ...row.entityIds])
  return controllable.filter((e) => !seen.has(e.entityId))
}

/** Add suggested devices to the owner's widget (and mark them known so they don't re-ask). */
export async function addSmartHomeControls(
  owner: DashboardOwner,
  entityIds: string[],
): Promise<SmartHomeSettings> {
  const current = await getRow(owner)
  const row = await prisma.smartHomeSettings.update({
    where: whereForOwner(owner),
    data: {
      entityIds: [...new Set([...current.entityIds, ...entityIds])],
      knownEntityIds: [...new Set([...current.knownEntityIds, ...entityIds])],
    },
  })
  return toSettings(row)
}

/**
 * Forget an entity deleted from Home Assistant: drop it from every owner's curated
 * widget list and "known" set, so it leaves all widgets and — should a device with
 * the same id ever return — is offered again as a new device. One statement across
 * all rows, scoped to only those that reference the id, so a deletion that never
 * concerned anyone costs no write.
 */
export async function forgetSmartHomeEntity(entityId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "SmartHomeSettings"
    SET "entityIds" = array_remove("entityIds", ${entityId}),
        "knownEntityIds" = array_remove("knownEntityIds", ${entityId}),
        "updatedAt" = NOW()
    WHERE ${entityId} = ANY("entityIds") OR ${entityId} = ANY("knownEntityIds")
  `
}

/** Dismiss suggested devices — mark known for this owner without adding to the widget. */
export async function dismissSmartHomeSuggestions(
  owner: DashboardOwner,
  entityIds: string[],
): Promise<void> {
  const current = await getRow(owner)
  await prisma.smartHomeSettings.update({
    where: whereForOwner(owner),
    data: { knownEntityIds: [...new Set([...current.knownEntityIds, ...entityIds])] },
  })
}
