import type { HaEntityState, SmartHomeSettings, UpdateSmartHomeSettingsInput } from '@hame/shared'
import { isControllableDomain } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { haClient } from '../integrations/home-assistant/client.js'

/**
 * The household's curated smart-home controls (spec §8.12, §10 Phase 6.3). A
 * singleton list of HA entity ids the Smart-home widget renders — selection
 * only, never the live state (§8.11). Member-level: the wall tablet is shared, so
 * either household member can curate it.
 *
 * `knownEntityIds` is the "already offered" set behind the dashboard's new-device
 * prompt: seeded once to whatever HA exposes when first connected, then any
 * controllable entity *not* in it (nor already on the widget) surfaces as a
 * suggestion — so adding a bulb later asks "add this?" without nagging about the
 * devices that were there all along.
 */
const SINGLETON_ID = 'singleton'

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

async function getRow(): Promise<SettingsRow> {
  return prisma.smartHomeSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })
}

/** Fetch the curated list, creating the empty default row on first access. */
export async function getSmartHomeSettings(): Promise<SmartHomeSettings> {
  return toSettings(await getRow())
}

/** Replace the curated list wholesale; selected ids also join the "known" set. */
export async function updateSmartHomeSettings(
  input: UpdateSmartHomeSettingsInput,
): Promise<SmartHomeSettings> {
  const entityIds = [...new Set(input.entityIds)]
  const current = await getRow()
  const row = await prisma.smartHomeSettings.update({
    where: { id: SINGLETON_ID },
    data: { entityIds, knownEntityIds: [...new Set([...current.knownEntityIds, ...entityIds])] },
  })
  return toSettings(row)
}

/**
 * New controllable devices to offer (the dashboard prompt). On the first call
 * after HA is connected, seeds `knownEntityIds` to the current devices as the
 * baseline and returns nothing — so only devices added *later* are suggested.
 * Returns [] when HA isn't connected / the registry is empty.
 */
export async function getSmartHomeSuggestions(): Promise<HaEntityState[]> {
  const controllable = controllableEntities()
  if (controllable.length === 0) return [] // HA not connected / not yet seeded

  const row = await getRow()
  if (!row.knownInitialised) {
    await prisma.smartHomeSettings.update({
      where: { id: SINGLETON_ID },
      data: { knownEntityIds: controllable.map((e) => e.entityId), knownInitialised: true },
    })
    return []
  }

  const seen = new Set([...row.knownEntityIds, ...row.entityIds])
  return controllable.filter((e) => !seen.has(e.entityId))
}

/** Add suggested devices to the widget (and mark them known so they don't re-ask). */
export async function addSmartHomeControls(entityIds: string[]): Promise<SmartHomeSettings> {
  const current = await getRow()
  const row = await prisma.smartHomeSettings.update({
    where: { id: SINGLETON_ID },
    data: {
      entityIds: [...new Set([...current.entityIds, ...entityIds])],
      knownEntityIds: [...new Set([...current.knownEntityIds, ...entityIds])],
    },
  })
  return toSettings(row)
}

/**
 * Forget an entity deleted from Home Assistant: drop it from both the curated
 * widget list and the "known" set, so it leaves the widget and — should a device
 * with the same id ever return — is offered again as a new device. A no-op when
 * the id isn't tracked, so a deletion that never concerned us costs no write.
 */
export async function forgetSmartHomeEntity(entityId: string): Promise<void> {
  const current = await getRow()
  if (!current.entityIds.includes(entityId) && !current.knownEntityIds.includes(entityId)) return
  await prisma.smartHomeSettings.update({
    where: { id: SINGLETON_ID },
    data: {
      entityIds: current.entityIds.filter((id) => id !== entityId),
      knownEntityIds: current.knownEntityIds.filter((id) => id !== entityId),
    },
  })
}

/** Dismiss suggested devices — mark known without adding them to the widget. */
export async function dismissSmartHomeSuggestions(entityIds: string[]): Promise<void> {
  const current = await getRow()
  await prisma.smartHomeSettings.update({
    where: { id: SINGLETON_ID },
    data: { knownEntityIds: [...new Set([...current.knownEntityIds, ...entityIds])] },
  })
}
