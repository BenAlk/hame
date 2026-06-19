import { z } from 'zod'
import { ASSIGNMENT_MODES, RECURRENCE_TYPES, WEEKDAYS } from '../constants/index.js'
import { MemberSummarySchema } from './user.js'
import { TagSchema } from './tag.js'
import { PetSchema, PetSummarySchema } from './pet.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

export const RecurrenceTypeSchema = z.enum(RECURRENCE_TYPES)
export const AssignmentModeSchema = z.enum(ASSIGNMENT_MODES)
export const WeekdaySchema = z.enum(WEEKDAYS)

// ── Create / update ──────────────────────────────────────────────────────────

/** Fields shared by create and update; recurrence consistency is enforced below. */
const ChoreFields = z.object({
  title: z.string().min(1, 'Title is required').max(80, 'Title is too long'),
  description: z.string().max(500).nullish(),
  recurrenceType: RecurrenceTypeSchema,
  intervalDays: z.number().int().positive().nullish(), // for INTERVAL
  weekdays: z.array(WeekdaySchema).optional(), // for WEEKLY
  dayOfMonth: z.number().int().min(1).max(31).nullish(), // for DATE_OF_MONTH
  oneOffDate: z.coerce.date().nullish(), // for ONE_OFF
  assignmentMode: AssignmentModeSchema.default('FIXED'),
  assignedToId: z.string().uuid().nullish(), // for FIXED
  rotatingUsers: z.array(z.string().uuid()).optional(), // for ROTATING
  petId: z.string().uuid().nullish(),
  tagIds: z.array(z.string().uuid()).optional(),
})

type ChoreShape = Partial<z.infer<typeof ChoreFields>>

/**
 * Cross-field rules: each recurrence type needs its own field, and each
 * assignment mode needs its assignee(s). Checks are skipped when the controlling
 * field is absent so the same refinement works for partial updates.
 */
function refineChore(data: ChoreShape, ctx: z.RefinementCtx) {
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
    case 'ONE_OFF':
      if (!data.oneOffDate)
        ctx.addIssue({ code: 'custom', path: ['oneOffDate'], message: 'A date is required' })
      break
  }
  if (data.assignmentMode === 'FIXED' && data.recurrenceType && !data.assignedToId)
    ctx.addIssue({
      code: 'custom',
      path: ['assignedToId'],
      message: 'Assign this chore to someone',
    })
  if (data.assignmentMode === 'ROTATING' && (!data.rotatingUsers || data.rotatingUsers.length < 2))
    ctx.addIssue({
      code: 'custom',
      path: ['rotatingUsers'],
      message: 'Rotating chores need at least two people',
    })
}

export const CreateChoreSchema = ChoreFields.superRefine(refineChore)
export type CreateChoreInput = z.infer<typeof CreateChoreSchema>

export const UpdateChoreSchema = ChoreFields.partial()
  .extend({ isActive: z.boolean().optional() })
  .superRefine(refineChore)
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateChoreInput = z.infer<typeof UpdateChoreSchema>

/** Mark an instance done — optional note and a backdateable completion time. */
export const CompleteInstanceSchema = z.object({
  notes: z.string().max(500).nullish(),
  completedAt: z.coerce.date().optional(),
})
export type CompleteInstanceInput = z.infer<typeof CompleteInstanceSchema>

// ── Public shapes ────────────────────────────────────────────────────────────

/** Minimal chore shape embedded in an instance (for history/timeline rows). */
export const ChoreSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  petId: z.string().uuid().nullable(),
})
export type ChoreSummary = z.infer<typeof ChoreSummarySchema>

export const ChoreInstanceSchema = z.object({
  id: z.string().uuid(),
  choreId: z.string().uuid(),
  chore: ChoreSummarySchema,
  assignedTo: MemberSummarySchema,
  dueDate: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
  completedBy: MemberSummarySchema.nullable(),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
})
export type ChoreInstance = z.infer<typeof ChoreInstanceSchema>

export const ChoreSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  recurrenceType: RecurrenceTypeSchema,
  intervalDays: z.number().nullable(),
  weekdays: z.array(WeekdaySchema),
  dayOfMonth: z.number().nullable(),
  oneOffDate: z.coerce.date().nullable(),
  assignmentMode: AssignmentModeSchema,
  assignedTo: MemberSummarySchema.nullable(),
  rotatingUsers: z.array(MemberSummarySchema),
  pet: PetSummarySchema.nullable(),
  tags: z.array(TagSchema),
  isActive: z.boolean(),
  createdById: z.string().uuid(),
  /** The current open (incomplete) occurrence, if any. */
  openInstance: ChoreInstanceSchema.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type Chore = z.infer<typeof ChoreSchema>

/** A pet plus its treatment history (completed instances of pet-linked chores). */
export const PetWithHistorySchema = PetSchema.extend({
  treatmentHistory: z.array(ChoreInstanceSchema),
})
export type PetWithHistory = z.infer<typeof PetWithHistorySchema>
