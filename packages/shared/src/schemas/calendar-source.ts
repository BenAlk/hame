import { z } from 'zod'
import { CALENDAR_SOURCE_TYPES, HEX_COLOUR_REGEX } from '../constants/index.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

export const CalendarSourceTypeSchema = z.enum(CALENDAR_SOURCE_TYPES)

// ── Create / update ──────────────────────────────────────────────────────────

const CalendarSourceFields = z.object({
  name: z.string().min(1, 'Name is required').max(80, 'Name is too long'),
  url: z.string().url('Enter a valid iCal URL').max(2000),
  colour: z.string().regex(HEX_COLOUR_REGEX, 'Pick a colour'),
  // Only ICAL is wired today; HOME_ASSISTANT arrives with Phase 6.
  type: CalendarSourceTypeSchema.default('ICAL'),
})

export const CreateCalendarSourceSchema = CalendarSourceFields
export type CreateCalendarSourceInput = z.infer<typeof CreateCalendarSourceSchema>

export const UpdateCalendarSourceSchema = CalendarSourceFields.partial()
  .extend({ isActive: z.boolean().optional() })
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateCalendarSourceInput = z.infer<typeof UpdateCalendarSourceSchema>

// ── Public shapes ────────────────────────────────────────────────────────────

export const CalendarSourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: CalendarSourceTypeSchema,
  url: z.string(),
  colour: z.string(),
  isActive: z.boolean(),
  lastSyncedAt: z.coerce.date().nullable(),
  /** Number of cached events from the last sync (for the management UI). */
  eventCount: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type CalendarSource = z.infer<typeof CalendarSourceSchema>

/** Result of a manual or scheduled sync. */
export const CalendarSyncResultSchema = z.object({
  ok: z.boolean(),
  count: z.number().int(),
  message: z.string(),
})
export type CalendarSyncResult = z.infer<typeof CalendarSyncResultSchema>
