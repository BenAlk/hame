import type { CalendarEvent } from '@hame/shared'
import { binOccurrencesInRange, type BinScheduleRule } from '@hame/shared'
import { prisma } from '../lib/prisma.js'

/**
 * Aggregated calendar feed (spec §8.10). Merges several tables into one unified
 * `CalendarEvent[]` for a date window — meals, chore instances, computed bin
 * collections, custom events and external (synced) calendar events. Nothing is
 * materialised: the feed is queried live so it can never drift out of sync
 * (spec §9.5). Synced events carry their source's colour.
 */
export async function getCalendar(start: Date, end: Date): Promise<CalendarEvent[]> {
  const [meals, instances, bins, events, synced, integrationEvents] = await Promise.all([
    prisma.mealPlanEntry.findMany({
      where: { date: { gte: start, lte: end } },
      select: {
        id: true,
        date: true,
        mealType: true,
        customLabel: true,
        recipe: { select: { title: true } },
      },
    }),
    prisma.choreInstance.findMany({
      where: { dueDate: { gte: start, lte: end } },
      select: {
        id: true,
        dueDate: true,
        chore: { select: { title: true } },
        assignedTo: { select: { colour: true } },
      },
    }),
    prisma.binCollection.findMany({
      where: { isActive: true },
      include: { occurrences: { where: { date: { gte: start, lte: end } } } },
    }),
    prisma.calendarObject.findMany({
      // A repeating row's own `startTime` may sit outside the window while it
      // still recurs into it (its cached "current CalDAV occurrence" can even
      // be in the past — see custom-event.service's roll-forward), so it's
      // fetched unconditionally and expanded in memory, the same shape as bins.
      where: {
        OR: [
          {
            recurrenceType: null,
            startTime: { lte: end },
            OR: [{ endTime: { gte: start } }, { endTime: null, startTime: { gte: start } }],
          },
          { recurrenceType: { not: null } },
        ],
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        allDay: true,
        colour: true,
        recurrenceType: true,
        intervalDays: true,
        weekdays: true,
        dayOfMonth: true,
        recurrenceAnchor: true,
      },
    }),
    prisma.syncedEvent.findMany({
      where: {
        source: { isActive: true },
        startTime: { lte: end },
        OR: [{ endTime: { gte: start } }, { endTime: null, startTime: { gte: start } }],
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        allDay: true,
        source: { select: { colour: true } },
      },
    }),
    // Dated events cached from CALENDAR-kind integrations (spec §10 Phase 10).
    prisma.integrationEvent.findMany({
      where: {
        integration: { isActive: true },
        startTime: { lte: end },
        OR: [{ endTime: { gte: start } }, { endTime: null, startTime: { gte: start } }],
      },
      select: { id: true, title: true, startTime: true, endTime: true, allDay: true },
    }),
  ])

  const out: CalendarEvent[] = []

  for (const m of meals) {
    out.push({
      id: `MEAL:${m.id}`,
      type: 'MEAL',
      title: m.recipe?.title ?? m.customLabel ?? m.mealType,
      startTime: m.date,
      endTime: null,
      allDay: true,
      colour: null,
      sourceId: m.id,
    })
  }

  for (const c of instances) {
    out.push({
      id: `CHORE:${c.id}`,
      type: 'CHORE',
      title: c.chore.title,
      startTime: c.dueDate,
      endTime: null,
      allDay: true,
      colour: c.assignedTo.colour,
      sourceId: c.id,
    })
  }

  for (const bin of bins) {
    // MANUAL bins compute their dates from the schedule; external bins read the
    // dates cached by their last sync (spec §10 Phase 5.6).
    let dates: Date[]
    if (bin.sourceType === 'MANUAL') {
      if (!bin.recurrenceType || bin.recurrenceType === 'ONE_OFF') continue // not a valid schedule
      const rule: BinScheduleRule = {
        recurrenceType: bin.recurrenceType,
        intervalDays: bin.intervalDays,
        weekdays: bin.weekdays,
        dayOfMonth: bin.dayOfMonth,
        startDate: bin.startDate,
      }
      dates = binOccurrencesInRange(rule, start, end)
    } else {
      dates = bin.occurrences.map((o) => o.date)
    }
    for (const date of dates) {
      const iso = isoDate(date)
      out.push({
        id: `BIN:${bin.id}:${iso}`,
        type: 'BIN',
        title: bin.name,
        // UTC midnight of the calendar day, matching how `@db.Date` meals/chores
        // serialize, so every all-day event lands on the same day for any viewer.
        startTime: new Date(`${iso}T00:00:00.000Z`),
        endTime: null,
        allDay: true,
        colour: bin.colour,
        sourceId: bin.id,
      })
    }
  }

  for (const e of events) {
    if (!e.recurrenceType || e.recurrenceType === 'ONE_OFF' || !e.recurrenceAnchor) {
      out.push({
        id: `EVENT:${e.id}`,
        type: 'EVENT',
        title: e.title,
        startTime: e.startTime,
        endTime: e.endTime,
        allDay: e.allDay,
        colour: e.colour,
        sourceId: e.id,
      })
      continue
    }
    // A repeating event's own row keeps only one cached occurrence (spec —
    // custom-event.service's CalDAV roll-forward); every occurrence in the
    // window is instead expanded live from the immutable `recurrenceAnchor`,
    // reusing the same engine bins already use for their own recurrence.
    const rule: BinScheduleRule = {
      recurrenceType: e.recurrenceType,
      intervalDays: e.intervalDays,
      weekdays: e.weekdays,
      dayOfMonth: e.dayOfMonth,
      startDate: e.recurrenceAnchor,
    }
    for (const date of binOccurrencesInRange(rule, start, end)) {
      const startTime = withDay(e.startTime, date)
      out.push({
        id: `EVENT:${e.id}:${isoDate(date)}`,
        type: 'EVENT',
        title: e.title,
        startTime,
        endTime: e.endTime ? withDay(e.endTime, date) : null,
        allDay: e.allDay,
        colour: e.colour,
        sourceId: e.id,
      })
    }
  }

  for (const s of synced) {
    out.push({
      id: `SYNCED:${s.id}`,
      type: 'SYNCED',
      title: s.title,
      startTime: s.startTime,
      endTime: s.endTime,
      allDay: s.allDay,
      colour: s.source.colour,
      sourceId: s.id,
    })
  }

  for (const ie of integrationEvents) {
    out.push({
      id: `INTEGRATION:${ie.id}`,
      type: 'INTEGRATION',
      title: ie.title,
      startTime: ie.startTime,
      endTime: ie.endTime,
      allDay: ie.allDay,
      colour: null,
      sourceId: ie.id,
    })
  }

  out.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  return out
}

/**
 * Local `YYYY-MM-DD` for a bin occurrence's id. The recurrence engine produces
 * local-midnight dates, so formatting in UTC (toISOString) would shift them a
 * day in any non-UTC zone — use the local calendar components.
 */
function isoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** `base`'s time-of-day transplanted onto `day`'s calendar date. */
function withDay(base: Date, day: Date): Date {
  const out = new Date(base)
  out.setFullYear(day.getFullYear(), day.getMonth(), day.getDate())
  return out
}
