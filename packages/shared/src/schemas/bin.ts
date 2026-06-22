import { z } from 'zod'
import {
  BIN_RECURRENCE_TYPES,
  BIN_SOURCE_TYPES,
  HEX_COLOUR_REGEX,
  WEEKDAYS,
} from '../constants/index.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

export const BinRecurrenceTypeSchema = z.enum(BIN_RECURRENCE_TYPES)
export const BinSourceTypeSchema = z.enum(BIN_SOURCE_TYPES)
const BinWeekdaySchema = z.enum(WEEKDAYS)

/**
 * Provider-specific connection details for an external bin source (spec §10
 * Phase 5.6). `MANUAL` bins carry no config; each external provider reads the
 * fields it needs (`url` for iCal, `councilId`/`addressId` for the scraper,
 * `entityId` for Home Assistant). `matchKey` says which bin in a multi-bin feed
 * maps to this coloured row (e.g. a feed event titled "Burgundy bin").
 */
export const BinSourceConfigSchema = z
  .object({
    url: z.string().url('Enter a valid feed URL').max(2000).optional(),
    matchKey: z.string().max(120).optional(),
    councilId: z.string().max(120).optional(),
    addressId: z.string().max(120).optional(),
    entityId: z.string().max(200).optional(),
  })
  .strict()
export type BinSourceConfig = z.infer<typeof BinSourceConfigSchema>

// ── Create / update ──────────────────────────────────────────────────────────

/** Fields shared by create and update; source/recurrence consistency is enforced below. */
const BinFields = z.object({
  name: z.string().min(1, 'Name is required').max(60, 'Name is too long'),
  colour: z.string().regex(HEX_COLOUR_REGEX, 'Pick a colour'),
  icon: z.string().max(40).nullish(),
  sourceType: BinSourceTypeSchema.default('MANUAL'),
  sourceConfig: BinSourceConfigSchema.nullish(),
  // MANUAL schedule (recurrence engine). External sources leave these null and
  // get their dates from a sync instead.
  recurrenceType: BinRecurrenceTypeSchema.nullish(),
  intervalDays: z.number().int().positive().nullish(), // for INTERVAL
  weekdays: z.array(BinWeekdaySchema).optional(), // for WEEKLY
  dayOfMonth: z.number().int().min(1).max(31).nullish(), // for DATE_OF_MONTH
  startDate: z.coerce.date().nullish(), // INTERVAL anchor (a real past collection)
  remindNightBefore: z.boolean().optional(),
  remindMorningOf: z.boolean().optional(),
})

type BinShape = Partial<z.infer<typeof BinFields>>

const issue = (ctx: z.RefinementCtx, path: string, message: string) =>
  ctx.addIssue({ code: 'custom', path: [path], message })

/**
 * Cross-field rules. A MANUAL bin needs a recurrence type and that type's own
 * field (INTERVAL also needs a startDate anchor) — mirroring the chore schema.
 * An external bin needs the connection detail its provider requires instead.
 * Checks are skipped when the controlling field is absent so the same refinement
 * works for partial updates.
 */
function refineBin(data: BinShape, ctx: z.RefinementCtx) {
  // `sourceType` defaults to MANUAL on create; on a partial update an absent
  // sourceType means "unchanged", so only validate the source it carries.
  const source = data.sourceType
  if (source === undefined || source === 'MANUAL') {
    switch (data.recurrenceType) {
      case 'INTERVAL':
        if (!data.intervalDays) issue(ctx, 'intervalDays', 'Interval in days is required')
        if (!data.startDate)
          issue(ctx, 'startDate', 'A known collection date is required to anchor the cycle')
        break
      case 'WEEKLY':
        if (!data.weekdays || data.weekdays.length === 0)
          issue(ctx, 'weekdays', 'Pick at least one weekday')
        break
      case 'DATE_OF_MONTH':
        if (!data.dayOfMonth) issue(ctx, 'dayOfMonth', 'Day of month is required')
        break
      default:
        // Only demand a recurrence type when this is an explicit MANUAL create.
        if (source === 'MANUAL') issue(ctx, 'recurrenceType', 'Pick how the collection repeats')
    }
    return
  }

  // External sources: require the provider's connection details.
  const config = data.sourceConfig ?? undefined
  switch (source) {
    case 'ICAL':
      if (!config?.url) issue(ctx, 'sourceConfig', 'An iCal feed URL is required')
      break
    case 'SCRAPER':
      if (!config?.councilId || !config?.addressId)
        issue(ctx, 'sourceConfig', 'A council and address are required')
      break
    case 'HOME_ASSISTANT':
      if (!config?.entityId) issue(ctx, 'sourceConfig', 'A Home Assistant entity is required')
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
  sourceType: BinSourceTypeSchema,
  sourceConfig: BinSourceConfigSchema.nullable(),
  recurrenceType: BinRecurrenceTypeSchema.nullable(),
  intervalDays: z.number().nullable(),
  weekdays: z.array(BinWeekdaySchema),
  dayOfMonth: z.number().nullable(),
  startDate: z.coerce.date().nullable(),
  remindNightBefore: z.boolean(),
  remindMorningOf: z.boolean(),
  isActive: z.boolean(),
  /** Next collection on or after today — computed from the schedule (MANUAL) or
   * the cached occurrences (external). Null if unscheduled / not yet synced. */
  nextCollection: z.coerce.date().nullable(),
  /** Last successful sync of an external source; null for MANUAL bins. */
  lastSyncedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type BinCollection = z.infer<typeof BinCollectionSchema>

/** Result of a manual or scheduled bin-source sync (mirrors CalendarSyncResult). */
export const BinSyncResultSchema = z.object({
  ok: z.boolean(),
  count: z.number().int(),
  message: z.string(),
})
export type BinSyncResult = z.infer<typeof BinSyncResultSchema>
