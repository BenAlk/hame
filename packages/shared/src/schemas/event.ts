import { z } from 'zod'
import { BIN_RECURRENCE_TYPES, HEX_COLOUR_REGEX } from '../constants/index.js'
import { MemberSummarySchema } from './user.js'
import { WeekdaySchema } from './chore.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

/** A repeating event's frequency — same three types bins use (no ONE_OFF: "doesn't repeat" is already `recurrenceType: null`). */
export const EventRecurrenceTypeSchema = z.enum(BIN_RECURRENCE_TYPES)

// ── Create / update ──────────────────────────────────────────────────────────

const CustomEventFields = z.object({
  title: z.string().min(1, 'Title is required').max(120, 'Title is too long'),
  description: z.string().max(1000).nullish(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date().nullish(),
  allDay: z.boolean().optional(),
  colour: z.string().regex(HEX_COLOUR_REGEX, 'Pick a colour').nullish(),
  recurrenceType: EventRecurrenceTypeSchema.nullish(),
  intervalDays: z.number().int().positive().nullish(), // for INTERVAL
  weekdays: z.array(WeekdaySchema).optional(), // for WEEKLY
  dayOfMonth: z.number().int().min(1).max(31).nullish(), // for DATE_OF_MONTH
})

type CustomEventShape = Partial<z.infer<typeof CustomEventFields>>

/**
 * End must not precede start when both are given, and a repeating event needs
 * its type's own field — the same cross-field shape as chores (`refineChore`),
 * minus ONE_OFF and assignment. Skipped when the controlling field is absent
 * so the same refinement works for partial updates.
 */
function refineEvent(data: CustomEventShape, ctx: z.RefinementCtx) {
  if (data.startTime && data.endTime && data.endTime < data.startTime)
    ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'End must be after start' })

  switch (data.recurrenceType) {
    case 'INTERVAL':
      if (!data.intervalDays)
        ctx.addIssue({
          code: 'custom',
          path: ['intervalDays'],
          message: 'Interval in days is required',
        })
      break
    case 'WEEKLY':
      if (!data.weekdays || data.weekdays.length === 0)
        ctx.addIssue({ code: 'custom', path: ['weekdays'], message: 'Pick at least one weekday' })
      break
    case 'DATE_OF_MONTH':
      if (!data.dayOfMonth)
        ctx.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'Day of month is required' })
      break
  }
}

export const CreateCustomEventSchema = CustomEventFields.superRefine(refineEvent)
export type CreateCustomEventInput = z.infer<typeof CreateCustomEventSchema>

export const UpdateCustomEventSchema = CustomEventFields.partial()
  .superRefine(refineEvent)
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateCustomEventInput = z.infer<typeof UpdateCustomEventSchema>

// ── Public shape ─────────────────────────────────────────────────────────────

export const CustomEventSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date().nullable(),
  allDay: z.boolean(),
  colour: z.string().nullable(),
  recurrenceType: EventRecurrenceTypeSchema.nullable(),
  intervalDays: z.number().nullable(),
  weekdays: z.array(WeekdaySchema),
  dayOfMonth: z.number().nullable(),
  createdBy: MemberSummarySchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type CustomEvent = z.infer<typeof CustomEventSchema>
