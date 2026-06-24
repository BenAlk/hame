import { z } from 'zod'
import {
  CALENDAR_SOURCE_TYPES,
  HEX_COLOUR_REGEX,
  type CalendarSourceType,
} from '../constants/index.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

export const CalendarSourceTypeSchema = z.enum(CALENDAR_SOURCE_TYPES)

// ── Create / update ──────────────────────────────────────────────────────────

const CalendarSourceFields = z.object({
  name: z.string().min(1, 'Name is required').max(80, 'Name is too long'),
  // For ICAL this is a feed URL; for HOME_ASSISTANT it is a calendar entity id
  // (e.g. "calendar.personal"), so the URL shape is enforced per-type below.
  url: z.string().min(1, 'Required').max(2000),
  colour: z.string().regex(HEX_COLOUR_REGEX, 'Pick a colour'),
  type: CalendarSourceTypeSchema.default('ICAL'),
})

/** ICAL sources need a real URL; HA sources carry an entity id, not a URL. */
const requireUrlForICal = (
  data: { type?: CalendarSourceType; url?: string },
  ctx: z.RefinementCtx,
) => {
  if (
    data.type === 'ICAL' &&
    data.url !== undefined &&
    !z.string().url().safeParse(data.url).success
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid iCal URL', path: ['url'] })
  }
}

export const CreateCalendarSourceSchema = CalendarSourceFields.superRefine(requireUrlForICal)
export type CreateCalendarSourceInput = z.infer<typeof CreateCalendarSourceSchema>

export const UpdateCalendarSourceSchema = CalendarSourceFields.partial()
  .extend({ isActive: z.boolean().optional() })
  .superRefine(requireUrlForICal)
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
