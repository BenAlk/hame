import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CollectionObservation } from 'uk-bin-scraper'

// Mock only the network surface (getCouncil → fetchObservation); keep the real
// deterministic projection so we exercise the actual anchoring maths.
const fetchObservation = vi.fn<() => Promise<CollectionObservation>>()
vi.mock('uk-bin-scraper', async (importActual) => {
  const actual = await importActual<typeof import('uk-bin-scraper')>()
  return {
    ...actual,
    getCouncil: (id: string) =>
      id === 'south-lanarkshire' ? { id, name: 'South Lanarkshire', fetchObservation } : null,
  }
})

const { scraperBinProvider } = await import('../integrations/bin-sources/scraper-bin-source.js')

const horizon = {
  start: new Date('2026-06-22T00:00:00.000Z'),
  end: new Date('2026-08-01T00:00:00.000Z'),
}

const observation: CollectionObservation = {
  area: 'Hamilton',
  weekStart: new Date('2026-06-22T00:00:00.000Z'),
  weekEnd: new Date('2026-06-26T00:00:00.000Z'),
  bins: [
    {
      name: 'Burgundy - Food and garden',
      key: 'burgundy',
      weekday: 2,
      frequencyDays: 14,
      outThisWeek: false,
    },
    {
      name: 'Black/Green - Non Recyclable Waste',
      key: 'black/green',
      weekday: 2,
      frequencyDays: 14,
      outThisWeek: true,
    },
    {
      name: 'Blue (paper and card)',
      key: 'blue',
      weekday: 2,
      frequencyDays: 28,
      outThisWeek: false,
    },
  ],
}

const config = { councilId: 'south-lanarkshire', addressId: '580009' }

function days(occ: { date: Date }[]): string[] {
  return occ.map((o) => o.date.toISOString().slice(0, 10))
}

describe('scraperBinProvider', () => {
  beforeEach(() => {
    fetchObservation.mockReset()
    fetchObservation.mockResolvedValue(observation)
  })

  it('matches the named bin and projects its dates', async () => {
    const occ = await scraperBinProvider.fetchOccurrences(
      { ...config, matchKey: 'Burgundy' },
      horizon,
    )
    // Fortnightly, not out this week → alternate week from Tue 23 Jun.
    expect(days(occ)).toEqual(['2026-06-30', '2026-07-14', '2026-07-28'])
  })

  it('uses the prior anchor to place a 4-weekly bin not out this week', async () => {
    const occ = await scraperBinProvider.fetchOccurrences(
      { ...config, matchKey: 'blue' },
      horizon,
      {
        priorAnchor: new Date('2026-05-12T00:00:00.000Z'),
      },
    )
    expect(days(occ)).toEqual(['2026-07-07'])
  })

  it('returns nothing for a 4-weekly bin with no prior anchor (pins later)', async () => {
    const occ = await scraperBinProvider.fetchOccurrences({ ...config, matchKey: 'blue' }, horizon)
    expect(occ).toEqual([])
  })

  it('throws when the bin name matches nothing on the page', async () => {
    await expect(
      scraperBinProvider.fetchOccurrences({ ...config, matchKey: 'purple' }, horizon),
    ).rejects.toThrow(/no bin matching/i)
  })

  it('throws for an unsupported council', async () => {
    await expect(
      scraperBinProvider.fetchOccurrences(
        { councilId: 'narnia', addressId: '1', matchKey: 'blue' },
        horizon,
      ),
    ).rejects.toThrow(/not supported/i)
  })

  it('requires council and address config', async () => {
    await expect(
      scraperBinProvider.fetchOccurrences({ matchKey: 'blue' }, horizon),
    ).rejects.toThrow(/council and address/i)
  })
})
