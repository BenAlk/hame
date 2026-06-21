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
  const [meals, instances, bins, events, synced] = await Promise.all([
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
    prisma.binCollection.findMany({ where: { isActive: true } }),
    prisma.customEvent.findMany({
      where: {
        startTime: { lte: end },
        OR: [{ endTime: { gte: start } }, { endTime: null, startTime: { gte: start } }],
      },
      select: { id: true, title: true, startTime: true, endTime: true, allDay: true, colour: true },
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
    if (bin.recurrenceType === 'ONE_OFF') continue // not a valid bin schedule
    const rule: BinScheduleRule = {
      recurrenceType: bin.recurrenceType,
      intervalDays: bin.intervalDays,
      weekdays: bin.weekdays,
      dayOfMonth: bin.dayOfMonth,
      startDate: bin.startDate,
    }
    for (const date of binOccurrencesInRange(rule, start, end)) {
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
