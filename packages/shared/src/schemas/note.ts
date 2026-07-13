import { z } from 'zod'
import { HEX_COLOUR_REGEX } from '../constants/index.js'
import { MemberSummarySchema } from './user.js'

/**
 * QuickNotes (spec §8.16, §10 Phase 11) — the household "fridge board". Short,
 * glanceable notes shown on dashboards and the wall-tablet screensaver, either
 * household-wide or as a private direct note to one member. These schemas are the
 * single source of truth for the compose form and the API's request validation.
 */

/** Longest a note body may be — kept short so it stays glanceable on the wall. */
export const NOTE_MAX_LENGTH = 280

/** Default lifetime of a non-pinned note; expired notes are swept nightly. */
export const NOTE_DEFAULT_TTL_DAYS = 7

/** Who a note is for. HOUSEHOLD shows on the shared board + screensaver; DIRECT
 *  is private to specific members and never surfaces on the shared tablet. */
export const NOTE_AUDIENCES = ['HOUSEHOLD', 'DIRECT'] as const
export type NoteAudience = (typeof NOTE_AUDIENCES)[number]
export const NoteAudienceSchema = z.enum(NOTE_AUDIENCES)

// ── Create / update ──────────────────────────────────────────────────────────

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

const NoteBody = z
  .string()
  .trim()
  .min(1, 'Write something')
  .max(NOTE_MAX_LENGTH, `Keep it under ${NOTE_MAX_LENGTH} characters`)

/**
 * A DIRECT note needs at least one recipient; a HOUSEHOLD note must not carry any.
 * Runs on create, skipping the check when the audience is absent so a partial
 * update that touches only the body/colour still validates.
 */
function refineAudience(
  data: { audience?: NoteAudience; recipientIds?: string[] },
  ctx: z.RefinementCtx,
) {
  const count = data.recipientIds?.length ?? 0
  if (data.audience === 'DIRECT' && count === 0) {
    ctx.addIssue({ code: 'custom', path: ['recipientIds'], message: 'Choose who it’s for' })
  }
  if (data.audience === 'HOUSEHOLD' && count > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['recipientIds'],
      message: 'A household note has no specific recipients',
    })
  }
}

const NoteFields = z.object({
  body: NoteBody,
  audience: NoteAudienceSchema.default('HOUSEHOLD'),
  /** Set only for a DIRECT note — the members it's addressed to (deduped). */
  recipientIds: z.array(z.string().uuid()).optional(),
  /** Sticky tint; omit to inherit the author's colour. */
  colour: z.string().regex(HEX_COLOUR_REGEX, 'Pick a colour').nullish(),
  /** Pinned notes sort to the top and never expire. */
  pinned: z.boolean().optional(),
})

export const CreateNoteSchema = NoteFields.superRefine(refineAudience)
export type CreateNoteInput = z.infer<typeof CreateNoteSchema>

/** Edit body / colour / pin only — a note's audience and recipient are fixed once
 *  posted (re-target by deleting and re-posting). */
export const UpdateNoteSchema = z
  .object({
    body: NoteBody.optional(),
    colour: z.string().regex(HEX_COLOUR_REGEX, 'Pick a colour').nullish(),
    pinned: z.boolean().optional(),
  })
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>

// ── Public shape ─────────────────────────────────────────────────────────────

/**
 * One addressee of a DIRECT note. `seenAt` is the read receipt shown to the
 * note's author (when the recipient first viewed it); it's null for viewers other
 * than the author, who don't get to see each other's read state.
 */
export const NoteRecipientSchema = MemberSummarySchema.extend({
  seenAt: z.coerce.date().nullable(),
})
export type NoteRecipient = z.infer<typeof NoteRecipientSchema>

/**
 * A note as returned to a viewer. Some fields are viewer-relative and computed
 * server-side: `mine` is whether the viewer authored it (so the UI offers edit /
 * delete), `dismissed` whether they've cleared it from their own board, and each
 * recipient's `seenAt` (populated only for the note's author) the read receipt.
 */
export const NoteSchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  audience: NoteAudienceSchema,
  author: MemberSummarySchema,
  /** The addressees of a DIRECT note; empty for a HOUSEHOLD note. */
  recipients: z.array(NoteRecipientSchema),
  colour: z.string().nullable(),
  pinned: z.boolean(),
  expiresAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  /** The viewer authored this note. */
  mine: z.boolean(),
  /** The viewer has dismissed this (household) note from their own board. */
  dismissed: z.boolean(),
})
export type Note = z.infer<typeof NoteSchema>
