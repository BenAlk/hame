import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HaEntityState } from '@hame/shared'

const upsert = vi.fn()
const update = vi.fn()
const getEntities = vi.fn<() => HaEntityState[]>(() => [])

vi.mock('../lib/prisma.js', () => ({
  prisma: { smartHomeSettings: { upsert, update } },
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
} = await import('../services/smart-home.service.js')

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
  getEntities.mockReset().mockReturnValue([])
})

describe('getSmartHomeSettings', () => {
  it('returns only the curated entity ids', async () => {
    upsert.mockResolvedValue(row({ entityIds: ['light.kitchen'] }))
    expect(await getSmartHomeSettings()).toEqual({ entityIds: ['light.kitchen'] })
  })
})

describe('updateSmartHomeSettings', () => {
  it('de-duplicates, persists, and folds the selection into the known set', async () => {
    upsert.mockResolvedValue(row({ knownEntityIds: ['light.kitchen'] }))
    update.mockResolvedValue({ entityIds: ['light.kitchen', 'scene.evening'] })
    const result = await updateSmartHomeSettings({
      entityIds: ['light.kitchen', 'scene.evening', 'light.kitchen'],
    })
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

    expect(await getSmartHomeSuggestions()).toEqual([])
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
    const suggestions = await getSmartHomeSuggestions()
    expect(suggestions.map((e) => e.entityId)).toEqual(['light.c'])
  })

  it('returns nothing when HA exposes no controllable entities', async () => {
    getEntities.mockReturnValue([])
    expect(await getSmartHomeSuggestions()).toEqual([])
    expect(update).not.toHaveBeenCalled()
  })
})

describe('addSmartHomeControls / dismissSmartHomeSuggestions', () => {
  it('adds to the widget and marks the devices known', async () => {
    upsert.mockResolvedValue(row({ entityIds: ['light.a'], knownEntityIds: ['light.a'] }))
    update.mockResolvedValue({ entityIds: ['light.a', 'light.c'] })
    await addSmartHomeControls(['light.c'])
    const data = update.mock.calls[0][0].data
    expect(data.entityIds).toEqual(['light.a', 'light.c'])
    expect(data.knownEntityIds).toEqual(['light.a', 'light.c'])
  })

  it('dismiss marks known without touching the widget selection', async () => {
    upsert.mockResolvedValue(row({ entityIds: ['light.a'], knownEntityIds: ['light.a'] }))
    update.mockResolvedValue(row())
    await dismissSmartHomeSuggestions(['light.c'])
    const data = update.mock.calls[0][0].data
    expect(data.knownEntityIds).toEqual(['light.a', 'light.c'])
    expect(data).not.toHaveProperty('entityIds')
  })
})
