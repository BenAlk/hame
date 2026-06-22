/**
 * Data operations backing the CalDAV server (spec §10 Phase 5.5). Hame exposes
 * several calendar collections:
 *   - `household` — read-write, backed by `CalendarObject` rows (the events the
 *     web UI and aggregated feed use); the raw iCalendar a client sends is stored
 *     verbatim and its summary fields extracted.
 *   - `meals` / `chores` / `bins` — read-only (v2), *derived* on the fly from the
 *     existing domain rows as all-day VEVENTs, so a phone sees everything Hame
 *     knows. Nothing is persisted for these; UIDs/ETags are computed from content.
 */
import { createHash } from 'node:crypto'
import { binOccurrencesInRange, type BinScheduleRule } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { buildEventICal, icalEtag, parseEventICal } from '../lib/icalendar.js'

export interface CalDavResource {
  uid: string
  etag: string
  icalRaw: string
}

export interface CalDavCollection {
  /** Path segment under /caldav/calendars/. */
  id: string
  displayName: string
  /** Hex colour for the client's calendar list. */
  colour: string
  readOnly: boolean
  ctag(): Promise<string>
  list(): Promise<CalDavResource[]>
  get(uid: string): Promise<CalDavResource | null>
}

// Expansion horizon for derived (read-only) calendars: ~a month back, ~a year on.
const HORIZON_PAST_DAYS = 31
const HORIZON_FUTURE_DAYS = 366
function horizon(): { start: Date; end: Date } {
  const now = Date.now()
  return {
    start: new Date(now - HORIZON_PAST_DAYS * 86_400_000),
    end: new Date(now + HORIZON_FUTURE_DAYS * 86_400_000),
  }
}

// ── household (read-write) ───────────────────────────────────────────────────

const objectSelect = { uid: true, etag: true, icalRaw: true } as const

async function householdList(): Promise<CalDavResource[]> {
  return prisma.calendarObject.findMany({ select: objectSelect, orderBy: { startTime: 'asc' } })
}

async function householdGet(uid: string): Promise<CalDavResource | null> {
  return prisma.calendarObject.findUnique({ where: { uid }, select: objectSelect })
}

/** getctag: count + latest mutation, so any add/edit/delete moves it. */
async function householdCtag(): Promise<string> {
  const agg = await prisma.calendarObject.aggregate({ _count: true, _max: { updatedAt: true } })
  return `${agg._count}-${agg._max.updatedAt?.getTime() ?? 0}`
}

/**
 * Create or replace a household event from a client-supplied iCalendar document
 * (lossless: the raw text is stored verbatim; summary fields are parsed out).
 * Returns the new etag and whether it was a create, or null if unparseable.
 */
export async function putCalDavObject(
  uid: string,
  icalRaw: string,
  userId: string,
): Promise<{ etag: string; created: boolean } | null> {
  const parsed = parseEventICal(icalRaw)
  if (!parsed) return null
  const etag = icalEtag(icalRaw)
  const fields = {
    title: parsed.title,
    description: parsed.description,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    allDay: parsed.allDay,
  }
  const existing = await prisma.calendarObject.findUnique({ where: { uid }, select: { id: true } })
  await prisma.calendarObject.upsert({
    where: { uid },
    update: { etag, icalRaw, ...fields },
    create: { uid, etag, icalRaw, ...fields, createdById: userId },
  })
  return { etag, created: !existing }
}

export async function deleteCalDavObject(uid: string): Promise<boolean> {
  const deleted = await prisma.calendarObject.deleteMany({ where: { uid } })
  return deleted.count > 0
}

// ── derived (read-only) ──────────────────────────────────────────────────────

interface AllDayEvent {
  uid: string
  title: string
  /** UTC-midnight of the calendar day. */
  date: Date
}

function toResource(e: AllDayEvent): CalDavResource {
  const icalRaw = buildEventICal({
    uid: e.uid,
    title: e.title,
    startTime: e.date,
    endTime: null,
    allDay: true,
  })
  return { uid: e.uid, etag: icalEtag(icalRaw), icalRaw }
}

/** UTC midnight of a date's *local* calendar day (bin occurrences are local-midnight). */
function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

async function mealEvents(): Promise<CalDavResource[]> {
  const { start, end } = horizon()
  const rows = await prisma.mealPlanEntry.findMany({
    where: { date: { gte: start, lte: end } },
    select: {
      id: true,
      date: true,
      mealType: true,
      customLabel: true,
      recipe: { select: { title: true } },
    },
  })
  return rows.map((r) =>
    toResource({
      uid: `meal-${r.id}@hame`,
      title: r.recipe?.title ?? r.customLabel ?? r.mealType,
      date: r.date,
    }),
  )
}

async function choreEvents(): Promise<CalDavResource[]> {
  const { start, end } = horizon()
  const rows = await prisma.choreInstance.findMany({
    where: { dueDate: { gte: start, lte: end } },
    select: { id: true, dueDate: true, chore: { select: { title: true } } },
  })
  return rows.map((r) =>
    toResource({ uid: `chore-${r.id}@hame`, title: r.chore.title, date: r.dueDate }),
  )
}

async function binEvents(): Promise<CalDavResource[]> {
  const { start, end } = horizon()
  const bins = await prisma.binCollection.findMany({
    where: { isActive: true },
    include: { occurrences: { where: { date: { gte: start, lte: end } } } },
  })
  const out: CalDavResource[] = []
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
    for (const occ of dates) {
      const date = toUtcMidnight(occ)
      out.push(
        toResource({
          uid: `bin-${bin.id}-${date.toISOString().slice(0, 10)}@hame`,
          title: bin.name,
          date,
        }),
      )
    }
  }
  return out
}

/** Read-only `get`: list then find — fine at household scale. */
function findInList(list: () => Promise<CalDavResource[]>) {
  return async (uid: string): Promise<CalDavResource | null> =>
    (await list()).find((r) => r.uid === uid) ?? null
}

/** getctag derived from the content of every resource, so any change moves it. */
function contentCtag(list: () => Promise<CalDavResource[]>) {
  return async (): Promise<string> => {
    const hash = createHash('sha256')
    for (const r of await list()) hash.update(`${r.uid}:${r.etag};`)
    return hash.digest('hex').slice(0, 16)
  }
}

// ── registry ─────────────────────────────────────────────────────────────────

export const CALDAV_COLLECTIONS: CalDavCollection[] = [
  {
    id: 'household',
    displayName: 'Household',
    colour: '#d16a6a',
    readOnly: false,
    list: householdList,
    get: householdGet,
    ctag: householdCtag,
  },
  {
    id: 'meals',
    displayName: 'Meals',
    colour: '#6f8169',
    readOnly: true,
    list: mealEvents,
    get: findInList(mealEvents),
    ctag: contentCtag(mealEvents),
  },
  {
    id: 'chores',
    displayName: 'Chores',
    colour: '#857a6c',
    readOnly: true,
    list: choreEvents,
    get: findInList(choreEvents),
    ctag: contentCtag(choreEvents),
  },
  {
    id: 'bins',
    displayName: 'Bins',
    colour: '#9aa0a6',
    readOnly: true,
    list: binEvents,
    get: findInList(binEvents),
    ctag: contentCtag(binEvents),
  },
]

export function getCollection(id: string): CalDavCollection | undefined {
  return CALDAV_COLLECTIONS.find((c) => c.id === id)
}
