import { describe, it, expect, vi, beforeEach } from 'vitest'

const eventCreate = vi.fn()
const eventUpdate = vi.fn()
const eventFindUnique = vi.fn()
const eventFindMany = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    calendarObject: {
      create: eventCreate,
      update: eventUpdate,
      findUnique: eventFindUnique,
      findMany: eventFindMany,
    },
  },
}))

const { createCustomEvent, updateCustomEvent, rollRecurringCalendarEvents } =
  await import('../services/custom-event.service.js')

const day = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min)

const memberInclude = { createdBy: { id: 'u1', firstName: 'Ben', colour: '#000' } }

beforeEach(() => {
  for (const fn of [eventCreate, eventUpdate, eventFindUnique, eventFindMany]) fn.mockReset()
  eventCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    id: 'e1',
    ...memberInclude,
    createdAt: new Date(),
    updatedAt: new Date(),
  }))
  eventUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'e1',
    ...data,
    ...memberInclude,
    createdAt: new Date(),
    updatedAt: new Date(),
  }))
})

describe('createCustomEvent', () => {
  it('persists no recurrence fields for a plain one-off event', async () => {
    await createCustomEvent(
      { title: 'Date night', startTime: day(2026, 5, 26, 18, 0), allDay: false },
      'u1',
    )
    const data = eventCreate.mock.calls[0][0].data
    expect(data.recurrenceType).toBeUndefined()
    expect(data.recurrenceAnchor).toBeUndefined()
  })

  it('anchors a repeating event to its own start day', async () => {
    await createCustomEvent(
      {
        title: 'Bin out',
        startTime: day(2026, 5, 23, 18, 0),
        allDay: false,
        recurrenceType: 'WEEKLY',
        weekdays: ['TUESDAY'],
      },
      'u1',
    )
    const data = eventCreate.mock.calls[0][0].data
    expect(data.recurrenceType).toBe('WEEKLY')
    expect(data.weekdays).toEqual(['TUESDAY'])
    expect(data.recurrenceAnchor).toEqual(day(2026, 5, 23))
  })
})

describe('updateCustomEvent', () => {
  const nonRepeating = {
    id: 'e1',
    uid: 'e1@hame',
    title: 'Date night',
    description: null,
    startTime: day(2026, 5, 26, 18, 0),
    endTime: null,
    allDay: false,
    recurrenceType: null,
    intervalDays: null,
    weekdays: [] as string[],
    dayOfMonth: null,
    recurrenceAnchor: null,
  }

  it('sets a fresh anchor when recurrence is turned on', async () => {
    eventFindUnique.mockResolvedValue(nonRepeating)
    await updateCustomEvent('e1', { recurrenceType: 'WEEKLY', weekdays: ['FRIDAY'] })
    const data = eventUpdate.mock.calls[0][0].data
    expect(data.recurrenceAnchor).toEqual(day(2026, 5, 26))
    expect(data.weekdays).toEqual(['FRIDAY'])
  })

  it('keeps the anchor when a repeating event is edited without moving its day', async () => {
    eventFindUnique.mockResolvedValue({
      ...nonRepeating,
      recurrenceType: 'WEEKLY',
      weekdays: ['FRIDAY'],
      recurrenceAnchor: day(2026, 0, 2), // an old anchor, months back
    })
    await updateCustomEvent('e1', { title: 'New title' })
    const data = eventUpdate.mock.calls[0][0].data
    expect(data.recurrenceAnchor).toEqual(day(2026, 0, 2)) // untouched
    expect(data.weekdays).toEqual(['FRIDAY']) // carried over, not cleared
  })

  it('recomputes the anchor when a repeating event moves to a new day', async () => {
    eventFindUnique.mockResolvedValue({
      ...nonRepeating,
      recurrenceType: 'WEEKLY',
      weekdays: ['FRIDAY'],
      recurrenceAnchor: day(2026, 0, 2),
    })
    await updateCustomEvent('e1', { startTime: day(2026, 5, 30, 18, 0) })
    const data = eventUpdate.mock.calls[0][0].data
    expect(data.recurrenceAnchor).toEqual(day(2026, 5, 30))
  })

  it('clears every recurrence field when recurrence is turned off', async () => {
    eventFindUnique.mockResolvedValue({
      ...nonRepeating,
      recurrenceType: 'WEEKLY',
      intervalDays: null,
      weekdays: ['FRIDAY'],
      dayOfMonth: null,
      recurrenceAnchor: day(2026, 0, 2),
    })
    await updateCustomEvent('e1', { recurrenceType: null })
    const data = eventUpdate.mock.calls[0][0].data
    expect(data).toMatchObject({
      recurrenceType: null,
      intervalDays: null,
      weekdays: [],
      dayOfMonth: null,
      recurrenceAnchor: null,
    })
  })
})

describe('rollRecurringCalendarEvents', () => {
  const repeatingRow = {
    id: 'e1',
    uid: 'e1@hame',
    title: 'Bin out',
    description: null,
    startTime: day(2026, 5, 2, 18, 30), // a past Tuesday occurrence, 18:30
    endTime: null,
    allDay: false,
    recurrenceType: 'WEEKLY' as const,
    intervalDays: null,
    weekdays: ['TUESDAY'],
    dayOfMonth: null,
    recurrenceAnchor: day(2026, 0, 6), // anchored months back
  }

  it('rolls the occurrence forward when the next one falls within the horizon', async () => {
    eventFindMany.mockResolvedValue([repeatingRow])
    await rollRecurringCalendarEvents(day(2026, 5, 3)) // Wednesday, day after the cached Tuesday

    expect(eventUpdate).toHaveBeenCalledTimes(1)
    const data = eventUpdate.mock.calls[0][0].data
    expect(data.startTime.getDate()).toBe(9) // next Tuesday
    expect(data.startTime.getHours()).toBe(18) // time-of-day preserved
    expect(data.startTime.getMinutes()).toBe(30)
  })

  it('does nothing while the current occurrence is still the next one', async () => {
    eventFindMany.mockResolvedValue([repeatingRow])
    // "Now" is still the Tuesday the row already reflects.
    await rollRecurringCalendarEvents(day(2026, 5, 2))
    expect(eventUpdate).not.toHaveBeenCalled()
  })

  it('does nothing for a non-repeating row', async () => {
    eventFindMany.mockResolvedValue([
      { ...repeatingRow, recurrenceType: null, recurrenceAnchor: null },
    ])
    await rollRecurringCalendarEvents(day(2026, 5, 3))
    expect(eventUpdate).not.toHaveBeenCalled()
  })
})
