/**
 * Single-event iCalendar (RFC 5545) round-trip for the CalDAV server (spec §10
 * Phase 5.5). Hame generates a clean minimal VEVENT for events authored in its
 * own UI ({@link buildEventICal}); when a phone PUTs a richer VCALENDAR, the raw
 * text is stored verbatim and only its summary fields are read back out
 * ({@link parseEventICal}) — so Hame never has to model every iCal feature.
 *
 * Both functions are pure (no I/O) and unit-tested. Parsing reuses `node-ical`.
 */
import { createHash } from 'node:crypto'
import ical, { type VEvent } from 'node-ical'

/** A short, content-derived ETag for a stored iCalendar resource (CalDAV concurrency). */
export function icalEtag(icalRaw: string): string {
  return createHash('sha256').update(icalRaw).digest('hex').slice(0, 32)
}

export interface ICalEventFields {
  uid: string
  title: string
  description?: string | null
  /** Absolute instant; emitted in UTC (`Z`) to avoid VTIMEZONE complexity. */
  startTime: Date
  endTime?: Date | null
  allDay: boolean
}

/** Fields extracted back out of a stored/imported VEVENT. */
export interface ParsedICalEvent {
  uid: string
  title: string
  description: string | null
  startTime: Date
  endTime: Date | null
  allDay: boolean
}

const PRODID = '-//Hame//Calendar//EN'

// ── Generate ─────────────────────────────────────────────────────────────────

/** Build a minimal one-event VCALENDAR document from structured fields. */
export function buildEventICal(e: ICalEventFields, dtstamp: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${formatUtc(dtstamp)}`,
    ...dtLines(e),
    `SUMMARY:${escapeText(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/** DTSTART/DTEND lines. All-day uses `VALUE=DATE` with an exclusive end (start + 1 day). */
function dtLines(e: ICalEventFields): string[] {
  if (e.allDay) {
    const end = e.endTime ?? addDays(e.startTime, 1)
    return [`DTSTART;VALUE=DATE:${formatDate(e.startTime)}`, `DTEND;VALUE=DATE:${formatDate(end)}`]
  }
  const out = [`DTSTART:${formatUtc(e.startTime)}`]
  if (e.endTime) out.push(`DTEND:${formatUtc(e.endTime)}`)
  return out
}

// ── Parse ────────────────────────────────────────────────────────────────────

/**
 * Extract the summary fields of the first VEVENT in a VCALENDAR document.
 * Returns null when there is no parseable event. Recurrence/alarms/etc. are
 * ignored here — the raw text is what's stored; this only feeds Hame's own grid.
 */
export function parseEventICal(ics: string): ParsedICalEvent | null {
  let data
  try {
    data = ical.parseICS(ics)
  } catch {
    return null
  }
  let event: VEvent | undefined
  for (const v of Object.values(data)) {
    if (v && v.type === 'VEVENT' && v.start) {
      event = v
      break
    }
  }
  if (!event) return null
  return {
    uid: event.uid ?? '',
    title: String(event.summary ?? '(untitled)'),
    description: event.description ? String(event.description) : null,
    startTime: event.start,
    endTime: event.end ?? null,
    allDay: event.datetype === 'date',
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** UTC date-time as `YYYYMMDDTHHMMSSZ`. */
function formatUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/** UTC date as `YYYYMMDD` (for all-day VALUE=DATE). */
function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

/** Escape a TEXT value per RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Fold a content line to ≤75 octets (RFC 5545 §3.1) with CRLF + space
 * continuations. Folds conservatively on character count to avoid splitting a
 * multi-byte sequence — fine for the short lines Hame generates.
 */
function foldLine(line: string): string {
  if (line.length <= 73) return line
  const chunks: string[] = []
  let rest = line
  chunks.push(rest.slice(0, 73))
  rest = rest.slice(73)
  while (rest.length > 72) {
    chunks.push(' ' + rest.slice(0, 72))
    rest = rest.slice(72)
  }
  if (rest.length > 0) chunks.push(' ' + rest)
  return chunks.join('\r\n')
}
