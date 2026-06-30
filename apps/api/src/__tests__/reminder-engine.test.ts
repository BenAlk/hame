import { describe, it, expect } from 'vitest'
import {
  buildReminders,
  slotForHour,
  MORNING_HOUR,
  EVENING_HOUR,
  type ReminderContext,
  type ReminderPrefs,
} from '../integrations/notifications/reminder-engine.js'

const ALL_ON: ReminderPrefs = {
  binReminders: true,
  choreReminders: true,
  expiryWarnings: true,
  lowStockAlerts: true,
  petCareReminders: true,
  customEventReminders: true,
}

const EMPTY: ReminderContext = {
  binsOutToday: [],
  binsOutTomorrow: [],
  choresDueToday: [],
  expiringSoon: [],
  lowStock: [],
  eventsToday: [],
}

const USER = 'user-1'

describe('slotForHour', () => {
  it('maps the morning and evening hours to their slots', () => {
    expect(slotForHour(MORNING_HOUR)).toBe('morning')
    expect(slotForHour(EVENING_HOUR)).toBe('evening')
  })

  it('returns null for any other hour', () => {
    expect(slotForHour(0)).toBeNull()
    expect(slotForHour(12)).toBeNull()
    expect(slotForHour(MORNING_HOUR + 1)).toBeNull()
  })
})

describe('buildReminders — evening (bins out tomorrow)', () => {
  it('sends a night-before bin reminder', () => {
    const ctx = { ...EMPTY, binsOutTomorrow: ['Burgundy bin', 'Blue bin'] }
    const out = buildReminders(ctx, ALL_ON, USER, 'evening')
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Bins out tomorrow')
    expect(out[0].lines[0]).toBe('Burgundy bin, Blue bin')
  })

  it('sends nothing when no bins are out tomorrow', () => {
    expect(buildReminders(EMPTY, ALL_ON, USER, 'evening')).toEqual([])
  })

  it('respects the binReminders toggle', () => {
    const ctx = { ...EMPTY, binsOutTomorrow: ['Burgundy bin'] }
    expect(buildReminders(ctx, { ...ALL_ON, binReminders: false }, USER, 'evening')).toEqual([])
  })

  it('never includes morning categories in the evening', () => {
    const ctx: ReminderContext = {
      ...EMPTY,
      binsOutTomorrow: ['Burgundy bin'],
      lowStock: ['Milk'],
      eventsToday: ['Date night'],
    }
    const out = buildReminders(ctx, ALL_ON, USER, 'evening')
    expect(out[0].lines.join('\n')).not.toMatch(/Milk|Date night/)
  })
})

describe('buildReminders — morning digest', () => {
  it('combines every enabled category that has content into one push', () => {
    const ctx: ReminderContext = {
      binsOutToday: ['Burgundy bin'],
      binsOutTomorrow: [],
      choresDueToday: [
        { title: 'Hoover', assignedToId: USER, isPetCare: false },
        { title: 'Worm the dog', assignedToId: USER, isPetCare: true },
      ],
      expiringSoon: ['Milk', 'Eggs'],
      lowStock: ['Flour'],
      eventsToday: ['Dentist'],
    }
    const out = buildReminders(ctx, ALL_ON, USER, 'morning')
    expect(out).toHaveLength(1)
    const body = out[0].lines.join('\n')
    expect(body).toContain('Bins out today: Burgundy bin')
    expect(body).toContain('Chores due: Hoover')
    expect(body).toContain('Pet care: Worm the dog')
    expect(body).toContain('Expiring soon: Milk, Eggs')
    expect(body).toContain('Low stock: Flour')
    expect(body).toContain('Today: Dentist')
  })

  it('sends nothing when nothing applies', () => {
    expect(buildReminders(EMPTY, ALL_ON, USER, 'morning')).toEqual([])
  })

  it('only sends a user the chores assigned to them', () => {
    const ctx: ReminderContext = {
      ...EMPTY,
      choresDueToday: [
        { title: 'Mine', assignedToId: USER, isPetCare: false },
        { title: 'Theirs', assignedToId: 'user-2', isPetCare: false },
      ],
    }
    const out = buildReminders(ctx, ALL_ON, USER, 'morning')
    expect(out[0].lines.join('\n')).toContain('Chores due: Mine')
    expect(out[0].lines.join('\n')).not.toContain('Theirs')
  })

  it('classifies pet-linked chores under pet care, not chores', () => {
    const ctx: ReminderContext = {
      ...EMPTY,
      choresDueToday: [{ title: 'Flea treatment', assignedToId: USER, isPetCare: true }],
    }
    const out = buildReminders(ctx, ALL_ON, USER, 'morning')
    const body = out[0].lines.join('\n')
    expect(body).toContain('Pet care: Flea treatment')
    expect(body).not.toContain('Chores due:')
  })

  it('honours each category toggle independently', () => {
    const ctx: ReminderContext = {
      ...EMPTY,
      binsOutToday: ['Burgundy bin'],
      lowStock: ['Milk'],
    }
    const prefs: ReminderPrefs = { ...ALL_ON, binReminders: false }
    const out = buildReminders(ctx, prefs, USER, 'morning')
    const body = out[0].lines.join('\n')
    expect(body).not.toContain('Bins out today')
    expect(body).toContain('Low stock: Milk')
  })

  it('drops the push entirely when every category is toggled off', () => {
    const ctx: ReminderContext = { ...EMPTY, binsOutToday: ['Burgundy bin'], lowStock: ['Milk'] }
    const allOff: ReminderPrefs = {
      binReminders: false,
      choreReminders: false,
      expiryWarnings: false,
      lowStockAlerts: false,
      petCareReminders: false,
      customEventReminders: false,
    }
    expect(buildReminders(ctx, allOff, USER, 'morning')).toEqual([])
  })
})
