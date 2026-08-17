import { describe, it, expect, vi, beforeEach } from 'vitest'

const calendarSource = {
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
const syncedEvent = { deleteMany: vi.fn(), createMany: vi.fn() }
const $transaction = vi.fn(async (ops: unknown) => ops)

vi.mock('../lib/prisma.js', () => ({
  prisma: { calendarSource, syncedEvent, $transaction },
}))

const fetchICalEvents = vi.fn()
vi.mock('../integrations/ical/index.js', () => ({
  fetchICalEvents: (...args: unknown[]) => fetchICalEvents(...args),
}))

const fetchHaCalendarEvents = vi.fn()
vi.mock('../integrations/home-assistant/calendars.js', () => ({
  fetchHaCalendarEvents: (...args: unknown[]) => fetchHaCalendarEvents(...args),
}))

const getConnectionSettings = vi.fn()
vi.mock('../services/home-assistant-config.service.js', () => ({
  getConnectionSettings: () => getConnectionSettings(),
}))

const service = await import('../services/calendar-source.service.js')

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'src-1',
    name: 'Council bins',
    type: 'ICAL',
    url: 'https://council.example/feed.ics',
    colour: '#7d2b3e',
    isActive: true,
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { events: 0 },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  $transaction.mockImplementation(async (ops: unknown) => ops)
})

describe('syncCalendarSource', () => {
  it('fetches an ICAL source by its feed URL and replaces cached events wholesale', async () => {
    calendarSource.findUnique.mockResolvedValue(row())
    fetchICalEvents.mockResolvedValue([
      {
        externalId: 'bin:1',
        title: 'Bin day',
        description: null,
        startTime: new Date('2026-08-20T00:00:00Z'),
        endTime: null,
        allDay: true,
      },
    ])

    const result = await service.syncCalendarSource('src-1')

    expect(fetchICalEvents).toHaveBeenCalledWith(row().url)
    expect(fetchHaCalendarEvents).not.toHaveBeenCalled()
    expect(syncedEvent.deleteMany).toHaveBeenCalledWith({ where: { sourceId: 'src-1' } })
    expect(syncedEvent.createMany.mock.calls[0][0].data).toEqual([
      {
        sourceId: 'src-1',
        externalId: 'bin:1',
        title: 'Bin day',
        description: null,
        startTime: new Date('2026-08-20T00:00:00Z'),
        endTime: null,
        allDay: true,
      },
    ])
    expect(result).toEqual({ ok: true, count: 1, message: 'Synced 1 events.' })
  })

  it('reads a HOME_ASSISTANT source by its stored entity id, not as a feed URL', async () => {
    calendarSource.findUnique.mockResolvedValue(
      row({ type: 'HOME_ASSISTANT', url: 'calendar.household' }),
    )
    getConnectionSettings.mockResolvedValue({ url: 'http://ha.local', token: 'tok' })
    fetchHaCalendarEvents.mockResolvedValue([])

    await service.syncCalendarSource('src-1')

    expect(fetchICalEvents).not.toHaveBeenCalled()
    expect(fetchHaCalendarEvents).toHaveBeenCalledWith(
      'http://ha.local',
      'tok',
      'calendar.household',
      expect.any(Date),
      expect.any(Date),
    )
  })

  it('rejects a HOME_ASSISTANT sync when HA is not connected', async () => {
    calendarSource.findUnique.mockResolvedValue(row({ type: 'HOME_ASSISTANT' }))
    getConnectionSettings.mockResolvedValue(null)

    const result = await service.syncCalendarSource('src-1')
    expect(result).toEqual({
      ok: false,
      count: 0,
      message: expect.stringContaining('not connected'),
    })
    expect(syncedEvent.deleteMany).not.toHaveBeenCalled()
  })

  it('returns ok:false and keeps the last-good cache when the fetch fails', async () => {
    calendarSource.findUnique.mockResolvedValue(row())
    fetchICalEvents.mockRejectedValue(new Error('feed unreachable'))

    const result = await service.syncCalendarSource('src-1')

    expect(result).toEqual({
      ok: false,
      count: 0,
      message: expect.stringContaining('feed unreachable'),
    })
    expect(syncedEvent.deleteMany).not.toHaveBeenCalled()
    expect(calendarSource.update).not.toHaveBeenCalled()
  })

  it('rejects an unknown source id', async () => {
    calendarSource.findUnique.mockResolvedValue(null)
    await expect(service.syncCalendarSource('nope')).rejects.toMatchObject({ status: 404 })
  })
})

describe('syncAllActiveSources (never throws)', () => {
  it('syncs every active source and skips a failing one rather than stopping', async () => {
    calendarSource.findMany.mockResolvedValue([
      { id: 'src-1', name: 'Bins' },
      { id: 'src-2', name: 'Events' },
    ])
    calendarSource.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(row({ id: where.id })),
    )
    // Sources sync one at a time, in order — the first fails, the second succeeds.
    fetchICalEvents.mockRejectedValueOnce(new Error('src-1 down')).mockResolvedValueOnce([])

    await expect(service.syncAllActiveSources()).resolves.toBeUndefined()
    expect(fetchICalEvents).toHaveBeenCalledTimes(2)
  })

  it('only syncs sources marked active', async () => {
    calendarSource.findMany.mockResolvedValue([])
    await service.syncAllActiveSources()
    expect(calendarSource.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, name: true },
    })
  })
})

describe('createCalendarSource', () => {
  it('creates the row and best-effort syncs it immediately', async () => {
    calendarSource.create.mockResolvedValue(row())
    calendarSource.findUnique.mockResolvedValue(row())
    fetchICalEvents.mockResolvedValue([])

    await service.createCalendarSource({
      name: 'Council bins',
      url: 'https://council.example/feed.ics',
      colour: '#7d2b3e',
      type: 'ICAL',
    })

    expect(calendarSource.create).toHaveBeenCalled()
    expect(fetchICalEvents).toHaveBeenCalled() // the initial sync ran
  })

  it('does not let a failed initial sync block creation', async () => {
    calendarSource.create.mockResolvedValue(row())
    calendarSource.findUnique.mockResolvedValue(row())
    fetchICalEvents.mockRejectedValue(new Error('unreachable'))

    await expect(
      service.createCalendarSource({
        name: 'Council bins',
        url: 'https://council.example/feed.ics',
        colour: '#7d2b3e',
        type: 'ICAL',
      }),
    ).resolves.toMatchObject({ id: 'src-1' })
  })
})

describe('deleteCalendarSource', () => {
  it('rejects an unknown source id', async () => {
    calendarSource.findUnique.mockResolvedValue(null)
    await expect(service.deleteCalendarSource('nope')).rejects.toMatchObject({ status: 404 })
  })
})
