import { describe, it, expect, vi, beforeEach } from 'vitest'

const mealFindMany = vi.fn()
const choreFindMany = vi.fn()
const binFindMany = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    mealPlanEntry: { findMany: mealFindMany },
    choreInstance: { findMany: choreFindMany },
    binCollection: { findMany: binFindMany },
    calendarObject: { findMany: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn() },
  },
}))

const { CALDAV_COLLECTIONS, getCollection } = await import('../services/caldav.service.js')

beforeEach(() => {
  for (const fn of [mealFindMany, choreFindMany, binFindMany]) {
    fn.mockReset()
    fn.mockResolvedValue([])
  }
})

describe('CalDAV collection registry', () => {
  it('exposes household (read-write) plus read-only meals/chores/bins', () => {
    expect(CALDAV_COLLECTIONS.map((c) => c.id)).toEqual(['household', 'meals', 'chores', 'bins'])
    expect(getCollection('household')?.readOnly).toBe(false)
    expect(getCollection('meals')?.readOnly).toBe(true)
    expect(getCollection('chores')?.readOnly).toBe(true)
    expect(getCollection('bins')?.readOnly).toBe(true)
    expect(getCollection('nope')).toBeUndefined()
  })
})

describe('derived calendars', () => {
  it('meals → all-day VEVENTs titled by recipe/label/type', async () => {
    mealFindMany.mockResolvedValue([
      {
        id: 'm1',
        date: new Date('2026-06-24T00:00:00Z'),
        mealType: 'DINNER',
        customLabel: null,
        recipe: { title: 'Bolognese' },
      },
      {
        id: 'm2',
        date: new Date('2026-06-25T00:00:00Z'),
        mealType: 'LUNCH',
        customLabel: 'Leftovers',
        recipe: null,
      },
    ])
    const res = await getCollection('meals')!.list()
    expect(res.map((r) => r.uid)).toEqual(['meal-m1@hame', 'meal-m2@hame'])
    expect(res[0].icalRaw).toContain('SUMMARY:Bolognese')
    expect(res[0].icalRaw).toContain('DTSTART;VALUE=DATE:20260624')
    expect(res[1].icalRaw).toContain('SUMMARY:Leftovers')
  })

  it('chores → all-day VEVENTs on the due date', async () => {
    choreFindMany.mockResolvedValue([
      { id: 'c1', dueDate: new Date('2026-06-22T00:00:00Z'), chore: { title: 'Hoover' } },
    ])
    const res = await getCollection('chores')!.list()
    expect(res[0]).toMatchObject({ uid: 'chore-c1@hame' })
    expect(res[0].icalRaw).toContain('SUMMARY:Hoover')
    expect(res[0].icalRaw).toContain('DTSTART;VALUE=DATE:20260622')
  })

  it('bins → one VEVENT per computed occurrence, skipping ONE_OFF', async () => {
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
      {
        id: 'b2',
        name: 'Odd',
        colour: '#000000',
        sourceType: 'MANUAL',
        recurrenceType: 'ONE_OFF',
        intervalDays: null,
        weekdays: [],
        dayOfMonth: null,
        startDate: null,
        occurrences: [],
      },
    ])
    const res = await getCollection('bins')!.list()
    expect(res.length).toBeGreaterThan(0) // Tuesdays across the horizon window
    expect(res.every((r) => r.uid.startsWith('bin-b1-'))).toBe(true) // b2 (ONE_OFF) skipped
    expect(res[0].uid).toMatch(/^bin-b1-\d{4}-\d{2}-\d{2}@hame$/)
    expect(res[0].icalRaw).toContain('SUMMARY:Burgundy bin')
  })

  it('a derived collection get() finds a generated resource by uid', async () => {
    choreFindMany.mockResolvedValue([
      { id: 'c9', dueDate: new Date('2026-06-22T00:00:00Z'), chore: { title: 'Bins out' } },
    ])
    expect(await getCollection('chores')!.get('chore-c9@hame')).toMatchObject({
      uid: 'chore-c9@hame',
    })
    expect(await getCollection('chores')!.get('nope')).toBeNull()
  })
})
