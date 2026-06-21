import { z } from 'zod'
import { BIN_RECURRENCE_TYPES, HEX_COLOUR_REGEX, WEEKDAYS } from '../constants/index.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

export const BinRecurrenceTypeSchema = z.enum(BIN_RECURRENCE_TYPES)
const BinWeekdaySchema = z.enum(WEEKDAYS)

// ── Create / update ──────────────────────────────────────────────────────────

/** Fields shared by create and update; recurrence consistency is enforced below. */
const BinFields = z.object({
  name: z.string().min(1, 'Name is required').max(60, 'Name is too long'),
  colour: z.string().regex(HEX_COLOUR_REGEX, 'Pick a colour'),
  icon: z.string().max(40).nullish(),
  recurrenceType: BinRecurrenceTypeSchema,
  intervalDays: z.number().int().positive().nullish(), // for INTERVAL
  weekdays: z.array(BinWeekdaySchema).optional(), // for WEEKLY
  dayOfMonth: z.number().int().min(1).max(31).nullish(), // for DATE_OF_MONTH
  startDate: z.coerce.date().nullish(), // INTERVAL anchor (a real past collection)
  remindNightBefore: z.boolean().optional(),
  remindMorningOf: z.boolean().optional(),
})

type BinShape = Partial<z.infer<typeof BinFields>>

/**
 * Cross-field rules mirroring the chore schema: each recurrence type needs its
 * own field (INTERVAL also needs a startDate anchor). Checks are skipped when the
 * controlling field is absent so the same refinement works for partial updates.
 */
function refineBin(data: BinShape, ctx: z.RefinementCtx) {
  switch (data.recurrenceType) {
    case 'INTERVAL':
      if (!data.intervalDays)
        ctx.addIssue({
          code: 'custom',
          path: ['intervalDays'],
          message: 'Interval in days is required',
        })
      if (!data.startDate)
        ctx.addIssue({
          code: 'custom',
          path: ['startDate'],
          message: 'A known collection date is required to anchor the cycle',
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

export const CreateBinSchema = BinFields.superRefine(refineBin)
export type CreateBinInput = z.infer<typeof CreateBinSchema>

export const UpdateBinSchema = BinFields.partial()
  .extend({ isActive: z.boolean().optional() })
  .superRefine(refineBin)
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateBinInput = z.infer<typeof UpdateBinSchema>

// ── Public shape ─────────────────────────────────────────────────────────────

export const BinCollectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  colour: z.string(),
  icon: z.string().nullable(),
  recurrenceType: BinRecurrenceTypeSchema,
  intervalDays: z.number().nullable(),
  weekdays: z.array(BinWeekdaySchema),
  dayOfMonth: z.number().nullable(),
  startDate: z.coerce.date().nullable(),
  remindNightBefore: z.boolean(),
  remindMorningOf: z.boolean(),
  isActive: z.boolean(),
  /** Next collection on or after today, computed from the schedule (null if unscheduled). */
  nextCollection: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type BinCollection = z.infer<typeof BinCollectionSchema>
