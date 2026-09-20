import { describe, it, expect, vi, beforeEach } from 'vitest'

const mealFindMany = vi.fn()
const instanceFindMany = vi.fn()
const binFindMany = vi.fn()
const eventFindMany = vi.fn()
const syncedFindMany = vi.fn()
const integrationEventFindMany = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    mealPlanEntry: { findMany: mealFindMany },
    choreInstance: { findMany: instanceFindMany },
    binCollection: { findMany: binFindMany },
    calendarObject: { findMany: eventFindMany },
    syncedEvent: { findMany: syncedFindMany },
    integrationEvent: { findMany: integrationEventFindMany },
  },
}))

const { getCalendar } = await import('../services/calendar.service.js')

const day = (y: number, m: number, d: number) => new Date(y, m, d)

beforeEach(() => {
  for (const fn of [
    mealFindMany,
    instanceFindMany,
    binFindMany,
    eventFindMany,
    syncedFindMany,
    integrationEventFindMany,
  ]) {
    fn.mockReset()
    fn.mockResolvedValue([])
  }
})

describe('getCalendar', () => {
  it('merges meals, chores, computed bins and events, sorted by start time', async () => {
    mealFindMany.mockResolvedValue([
      {
        id: 'm1',
        date: day(2026, 5, 24),
        mealType: 'DINNER',
        customLabel: null,
        recipe: { title: 'Bolognese' },
      },
    ])
    instanceFindMany.mockResolvedValue([
      {
        id: 'c1',
        dueDate: day(2026, 5, 22),
        chore: { title: 'Hoover' },
        assignedTo: { colour: '#6f8169' },
      },
    ])
    binFindMany.mockResolvedValue([
      {
        id: 'b1',
        name: 'Burgundy bin',
        colour: '#7d2b3e',
        sourceType: 'MANUAL',
        recurrenceType: 'WEEKLY',
        intervalDays: null,
        weekdays: ['TUESDAY'],
        dayOfMonth: null,
        startDate: null,
        occurrences: [],
      },
    ])
    eventFindMany.mockResolvedValue([
      {
        id: 'e1',
        title: 'Date night',
        startTime: day(2026, 5, 26),
        endTime: null,
        allDay: false,
        colour: '#d16a6a',
      },
    ])

    const events = await getCalendar(day(2026, 5, 22), day(2026, 5, 28))

    // Sorted: chore (22), bin Tue (23), meal (24), event (26)
    expect(events.map((e) => e.type)).toEqual(['CHORE', 'BIN', 'MEAL', 'EVENT'])
    const bin = events.find((e) => e.type === 'BIN')!
    expect(bin).toMatchObject({
      title: 'Burgundy bin',
      colour: '#7d2b3e',
      allDay: true,
      sourceId: 'b1',
    })
    expect(bin.id).toBe('BIN:b1:2026-06-23')
    expect(events.find((e) => e.type === 'CHORE')).toMatchObject({
      title: 'Hoover',
      colour: '#6f8169',
    })
    expect(events.find((e) => e.type === 'MEAL')).toMatchObject({
      title: 'Bolognese',
      colour: null,
    })
  })

  it('falls back to custom label then meal type for a recipe-less meal', async () => {
    mealFindMany.mockResolvedValue([
      {
        id: 'm1',
        date: day(2026, 5, 24),
        mealType: 'DINNER',
        customLabel: 'Takeaway',
        recipe: null,
      },
      { id: 'm2', date: day(2026, 5, 25), mealType: 'LUNCH', customLabel: null, recipe: null },
    ])
    const events = await getCalendar(day(2026, 5, 22), day(2026, 5, 28))
    expect(events.map((e) => e.title)).toEqual(['Takeaway', 'LUNCH'])
  })

  it('includes synced events carrying their source colour', async () => {
    syncedFindMany.mockResolvedValue([
      {
        id: 's1',
        title: 'Team offsite',
        startTime: day(2026, 5, 25),
        endTime: null,
        allDay: true,
        source: { colour: '#2f6fb0' },
      },
    ])
    const events = await getCalendar(day(2026, 5, 22), day(2026, 5, 28))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'SYNCED',
      title: 'Team offsite',
      colour: '#2f6fb0',
      sourceId: 's1',
      id: 'SYNCED:s1',
    })
  })

  it('skips a bin with an invalid ONE_OFF recurrence rather than throwing', async () => {
    binFindMany.mockResolvedValue([
      {
        id: 'b1',
        name: 'Odd bin',
        colour: '#7d2b3e',
        sourceType: 'MANUAL',
        recurrenceType: 'ONE_OFF',
        intervalDays: null,
        weekdays: [],
        dayOfMonth: null,
        startDate: null,
        occurrences: [],
      },
    ])
    const events = await getCalendar(day(2026, 5, 22), day(2026, 5, 28))
    expect(events).toEqual([])
  })

  it('materialises an external bin from its cached occurrences, not the engine', async () => {
    binFindMany.mockResolvedValue([
      {
        id: 'b9',
        name: 'Council bin',
        colour: '#2f6fb0',
        sourceType: 'ICAL',
        recurrenceType: null,
        intervalDays: null,
        weekdays: [],
        dayOfMonth: null,
        startDate: null,
        occurrences: [{ date: day(2026, 5, 25) }],
      },
    ])
    const events = await getCalendar(day(2026, 5, 22), day(2026, 5, 28))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'BIN', title: 'Council bin', colour: '#2f6fb0' })
    expect(events[0].id).toBe('BIN:b9:2026-06-25')
  })

  it('expands a repeating event into every occurrence in the window, even from an old anchor', async () => {
    eventFindMany.mockResolvedValue([
      {
        id: 'e2',
        title: 'Bin out',
        startTime: new Date(2026, 0, 6, 18, 30), // an 18:30 event, first anchored months ago
        endTime: null,
        allDay: false,
        colour: '#d16a6a',
        recurrenceType: 'WEEKLY',
        intervalDays: null,
        weekdays: ['TUESDAY'],
        dayOfMonth: null,
        recurrenceAnchor: day(2026, 0, 6),
      },
    ])
    const events = await getCalendar(day(2026, 5, 22), day(2026, 5, 28))
    const occurrences = events.filter((e) => e.type === 'EVENT')
    expect(occurrences).toHaveLength(1) // one Tuesday (23 Jun) in this window
    expect(occurrences[0].id).toBe('EVENT:e2:2026-06-23')
    expect(occurrences[0].startTime.getHours()).toBe(18) // time-of-day preserved
    expect(occurrences[0].startTime.getMinutes()).toBe(30)
    expect(occurrences[0].startTime.getDate()).toBe(23)
  })

  it('treats a non-repeating event as a single occurrence, unchanged', async () => {
    eventFindMany.mockResolvedValue([
      {
        id: 'e3',
        title: 'One-off',
        startTime: day(2026, 5, 24),
        endTime: null,
        allDay: true,
        colour: null,
        recurrenceType: null,
        intervalDays: null,
        weekdays: [],
        dayOfMonth: null,
        recurrenceAnchor: null,
      },
    ])
    const events = await getCalendar(day(2026, 5, 22), day(2026, 5, 28))
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe('EVENT:e3')
  })

  it('merges cached events from CALENDAR-kind integrations', async () => {
    integrationEventFindMany.mockResolvedValue([
      {
        id: 'ie1',
        title: 'hame: v1.0',
        startTime: day(2026, 5, 26),
        endTime: null,
        allDay: true,
      },
    ])
    const events = await getCalendar(day(2026, 5, 22), day(2026, 5, 28))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'INTEGRATION', title: 'hame: v1.0', colour: null })
    expect(events[0].id).toBe('INTEGRATION:ie1')
  })
})
