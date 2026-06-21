import { z } from 'zod'
import { HEX_COLOUR_REGEX } from '../constants/index.js'
import { MemberSummarySchema } from './user.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

// ── Create / update ──────────────────────────────────────────────────────────

const CustomEventFields = z.object({
  title: z.string().min(1, 'Title is required').max(120, 'Title is too long'),
  description: z.string().max(1000).nullish(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date().nullish(),
  allDay: z.boolean().optional(),
  colour: z.string().regex(HEX_COLOUR_REGEX, 'Pick a colour').nullish(),
})

/** End must not precede start when both are given. Skipped on partial updates that omit either. */
function refineEvent(data: Partial<z.infer<typeof CustomEventFields>>, ctx: z.RefinementCtx) {
  if (data.startTime && data.endTime && data.endTime < data.startTime)
    ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'End must be after start' })
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
  createdBy: MemberSummarySchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type CustomEvent = z.infer<typeof CustomEventSchema>
