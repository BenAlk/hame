import { z } from 'zod'
import { CALENDAR_EVENT_TYPES } from '../constants/index.js'

export const CalendarEventTypeSchema = z.enum(CALENDAR_EVENT_TYPES)

/**
 * One unified event in the aggregated calendar feed (spec §8.10). The endpoint
 * merges rows from several tables into this shape; `type` discriminates the
 * origin and `sourceId` points back at the underlying row (a `ChoreInstance`,
 * `MealPlanEntry`, `CustomEvent`, or `BinCollection`). Bins and chores are
 * all-day; custom events carry real times. No event is persisted in this shape —
 * the feed is computed live so nothing can drift out of sync (spec §9.5).
 */
export const CalendarEventSchema = z.object({
  /** Stable within a response: `${type}:${sourceId}` (+ date for recurring bins). */
  id: z.string(),
  type: CalendarEventTypeSchema,
  title: z.string(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date().nullable(),
  allDay: z.boolean(),
  colour: z.string().nullable(),
  /** The id of the underlying row, for follow-up navigation. */
  sourceId: z.string(),
})
export type CalendarEvent = z.infer<typeof CalendarEventSchema>

/** Query window for the aggregated calendar — both bounds required (inclusive). */
export const CalendarQuerySchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
})
export type CalendarQuery = z.infer<typeof CalendarQuerySchema>
