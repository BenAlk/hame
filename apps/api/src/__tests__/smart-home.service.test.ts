import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HaEntityState } from '@hame/shared'
import type { DashboardOwner } from '../lib/dashboard-owner.js'

const upsert = vi.fn()
const update = vi.fn()
const executeRaw = vi.fn()
const getEntities = vi.fn<() => HaEntityState[]>(() => [])

vi.mock('../lib/prisma.js', () => ({
  prisma: { smartHomeSettings: { upsert, update }, $executeRaw: executeRaw },
}))
vi.mock('../integrations/home-assistant/client.js', () => ({
  haClient: { getEntities },
}))

const {
  getSmartHomeSettings,
  updateSmartHomeSettings,
  getSmartHomeSuggestions,
  addSmartHomeControls,
  dismissSmartHomeSuggestions,
  forgetSmartHomeEntity,
} = await import('../services/smart-home.service.js')

const USER: DashboardOwner = { kind: 'user', userId: 'u1' }
const HOUSEHOLD: DashboardOwner = { kind: 'household' }

function entity(entityId: string, domain: string): HaEntityState {
  return { entityId, domain, state: 'on', friendlyName: null, attributes: {}, lastChanged: null }
}

function row(
  over: Partial<{ entityIds: string[]; knownEntityIds: string[]; knownInitialised: boolean }> = {},
) {
  return { entityIds: [], knownEntityIds: [], knownInitialised: false, ...over }
}

beforeEach(() => {
  upsert.mockReset()
  update.mockReset()
  executeRaw.mockReset()
  getEntities.mockReset().mockReturnValue([])
})

describe('getSmartHomeSettings', () => {
  it('returns only the curated entity ids', async () => {
    upsert.mockResolvedValue(row({ entityIds: ['light.kitchen'] }))
    expect(await getSmartHomeSettings(USER)).toEqual({ entityIds: ['light.kitchen'] })
  })

  it('keys and seeds each owner independently (user vs household)', async () => {
    upsert.mockResolvedValue(row())

    await getSmartHomeSettings(USER)
    expect(upsert.mock.calls[0][0].where).toEqual({ userId: 'u1' })
    expect(upsert.mock.calls[0][0].create).toEqual({ userId: 'u1' })

    await getSmartHomeSettings(HOUSEHOLD)
    expect(upsert.mock.calls[1][0].where).toEqual({ id: 'household' })
    expect(upsert.mock.calls[1][0].create).toEqual({ id: 'household', isHousehold: true })
  })
})

describe('updateSmartHomeSettings', () => {
  it('de-duplicates, persists, and folds the selection into the known set', async () => {
    upsert.mockResolvedValue(row({ knownEntityIds: ['light.kitchen'] }))
    update.mockResolvedValue({ entityIds: ['light.kitchen', 'scene.evening'] })
    const result = await updateSmartHomeSettings(USER, {
      entityIds: ['light.kitchen', 'scene.evening', 'light.kitchen'],
    })
    expect(update.mock.calls[0][0].where).toEqual({ userId: 'u1' })
    const data = update.mock.calls[0][0].data
    expect(data.entityIds).toEqual(['light.kitchen', 'scene.evening'])
    expect(data.knownEntityIds).toEqual(['light.kitchen', 'scene.evening'])
    expect(result.entityIds).toEqual(['light.kitchen', 'scene.evening'])
  })
})

describe('getSmartHomeSuggestions', () => {
  it('returns nothing and seeds the baseline on the first run', async () => {
    getEntities.mockReturnValue([entity('light.a', 'light'), entity('light.b', 'light')])
    upsert.mockResolvedValue(row({ knownInitialised: false }))
    update.mockResolvedValue(row())

    expect(await getSmartHomeSuggestions(USER)).toEqual([])
    expect(update.mock.calls[0][0].data).toEqual({
      knownEntityIds: ['light.a', 'light.b'],
      knownInitialised: true,
    })
  })

  it('offers only controllable devices not already known or selected', async () => {
    getEntities.mockReturnValue([
      entity('light.a', 'light'),
      entity('light.c', 'light'), // new
      entity('sensor.temp', 'sensor'), // not controllable — never suggested
    ])
    upsert.mockResolvedValue(
      row({
        entityIds: ['light.a'],
        knownEntityIds: ['light.a', 'light.b'],
        knownInitialised: true,
      }),
    )
    const suggestions = await getSmartHomeSuggestions(HOUSEHOLD)
    expect(suggestions.map((e) => e.entityId)).toEqual(['light.c'])
  })

  it('returns nothing when HA exposes no controllable entities', async () => {
    getEntities.mockReturnValue([])
    expect(await getSmartHomeSuggestions(USER)).toEqual([])
    expect(update).not.toHaveBeenCalled()
  })
})

describe('addSmartHomeControls / dismissSmartHomeSuggestions', () => {
  it('adds to the widget and marks the devices known', async () => {
    upsert.mockResolvedValue(row({ entityIds: ['light.a'], knownEntityIds: ['light.a'] }))
    update.mockResolvedValue({ entityIds: ['light.a', 'light.c'] })
    await addSmartHomeControls(USER, ['light.c'])
    const data = update.mock.calls[0][0].data
    expect(data.entityIds).toEqual(['light.a', 'light.c'])
    expect(data.knownEntityIds).toEqual(['light.a', 'light.c'])
  })

  it('dismiss marks known without touching the widget selection', async () => {
    upsert.mockResolvedValue(row({ entityIds: ['light.a'], knownEntityIds: ['light.a'] }))
    update.mockResolvedValue(row())
    await dismissSmartHomeSuggestions(USER, ['light.c'])
    const data = update.mock.calls[0][0].data
    expect(data.knownEntityIds).toEqual(['light.a', 'light.c'])
    expect(data).not.toHaveProperty('entityIds')
  })
})

describe('forgetSmartHomeEntity', () => {
  it('prunes a deleted entity from every owner in one statement', async () => {
    executeRaw.mockResolvedValue(2)
    await forgetSmartHomeEntity('light.gone')
    // Tagged-template call: the entity id is interpolated as a bound value.
    expect(executeRaw).toHaveBeenCalledTimes(1)
    expect(executeRaw.mock.calls[0]).toContain('light.gone')
    // No per-owner read/update — the single cross-owner statement handles it.
    expect(upsert).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
