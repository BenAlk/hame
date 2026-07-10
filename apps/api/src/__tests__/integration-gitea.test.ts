import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  giteaProvider,
  mapMilestonesToEvents,
  type GiteaMilestone,
} from '../integrations/providers/gitea.js'
import {
  getIntegrationProvider,
  listIntegrationProviders,
  registerBuiltInIntegrationProviders,
} from '../integrations/providers/index.js'

/** A horizon spanning all of 2026, so the fixtures' dates fall inside it. */
const horizon = { start: new Date('2026-01-01'), end: new Date('2026-12-31') }

function milestone(id: number, title: string, due: string | null): GiteaMilestone {
  return { id, title, due_on: due }
}

describe('mapMilestonesToEvents', () => {
  it('maps due milestones to sorted, all-day "repo: title" events', () => {
    const out = mapMilestonesToEvents(
      [milestone(2, 'v2', '2026-06-30T00:00:00Z'), milestone(1, 'v1', '2026-06-16T12:00:00Z')],
      'hame',
      horizon,
    )
    expect(out).toEqual([
      {
        externalId: 'milestone:1',
        title: 'hame: v1',
        startTime: new Date('2026-06-16T00:00:00.000Z'),
        endTime: null,
        allDay: true,
      },
      {
        externalId: 'milestone:2',
        title: 'hame: v2',
        startTime: new Date('2026-06-30T00:00:00.000Z'),
        endTime: null,
        allDay: true,
      },
    ])
  })

  it('drops milestones with no real due date (null, empty, sentinel, pre-1970)', () => {
    const out = mapMilestonesToEvents(
      [
        milestone(1, 'null', null),
        milestone(2, 'empty', ''),
        milestone(3, 'sentinel', '0001-01-01T00:00:00Z'),
        milestone(4, 'real', '2026-05-01T00:00:00Z'),
      ],
      'hame',
      horizon,
    )
    expect(out.map((e) => e.externalId)).toEqual(['milestone:4'])
  })

  it('drops due dates outside the horizon', () => {
    const out = mapMilestonesToEvents(
      [milestone(1, 'old', '2025-01-01T00:00:00Z'), milestone(2, 'in', '2026-03-01T00:00:00Z')],
      'hame',
      horizon,
    )
    expect(out.map((e) => e.externalId)).toEqual(['milestone:2'])
  })
})

describe('registerBuiltInIntegrationProviders', () => {
  it('wires the Gitea provider into the registry as a CALENDAR provider', () => {
    registerBuiltInIntegrationProviders()
    const provider = getIntegrationProvider('gitea')
    expect(provider?.kind).toBe('CALENDAR')
    expect(listIntegrationProviders().some((p) => p.id === 'gitea')).toBe(true)
    expect(getIntegrationProvider('nope')).toBeNull()
  })
})

describe('giteaProvider (mocked fetch)', () => {
  const ctx = {
    config: { url: 'http://gitea.test/', owner: 'ben', repo: 'hame' },
    secret: 'tok123',
  }

  afterEach(() => vi.unstubAllGlobals())

  it('sends token auth and maps the milestones endpoint response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([milestone(7, 'Release', '2026-08-01T00:00:00Z')]), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const events = await giteaProvider.fetchEvents(ctx, horizon)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://gitea.test/api/v1/repos/ben/hame/milestones?state=all&limit=50')
    expect((init.headers as Record<string, string>).Authorization).toBe('token tok123')
    expect(events).toEqual([
      {
        externalId: 'milestone:7',
        title: 'hame: Release',
        startTime: new Date('2026-08-01T00:00:00.000Z'),
        endTime: null,
        allDay: true,
      },
    ])
  })

  it('throws a clear message when the token is rejected on test', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    await expect(giteaProvider.test(ctx)).rejects.toThrow(/token/i)
  })

  it('throws when the repo is not found on test', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
    await expect(giteaProvider.test(ctx)).rejects.toThrow(/not found/i)
  })

  it('resolves test on a 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
    await expect(giteaProvider.test(ctx)).resolves.toBeUndefined()
  })

  it('rejects a config missing owner/repo before fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      giteaProvider.fetchEvents({ config: { url: 'http://gitea.test' }, secret: 't' }, horizon),
    ).rejects.toThrow(/owner/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
