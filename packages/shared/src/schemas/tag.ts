import { z } from 'zod'
import { HEX_COLOUR_REGEX } from '../constants/index.js'
import { TAG_KINDS } from '../tag-kinds.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

/**
 * `kind` is optional on create because the surface creating the tag supplies it
 * (spec §10 Phase 24) — nobody is asked to classify a tag mid-flow. Omitting it
 * lands on the column's own default, `ITEM`, which is the honest answer for a
 * caller that didn't say: item vocabulary is what inline creation has only ever
 * been able to make.
 */
export const CreateTagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(30, 'Tag name is too long'),
  kind: z.enum(TAG_KINDS).optional(),
  colour: z.string().regex(HEX_COLOUR_REGEX, 'Must be a hex colour, e.g. #3B82F6').nullish(),
})
export type CreateTagInput = z.infer<typeof CreateTagSchema>

export const UpdateTagSchema = z
  .object({
    name: z.string().min(1).max(30).optional(),
    kind: z.enum(TAG_KINDS).optional(),
    colour: z.string().regex(HEX_COLOUR_REGEX).nullish(),
  })
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>

/** Public representation of a tag. */
export const TagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.enum(TAG_KINDS),
  colour: z.string().nullable(),
})
export type Tag = z.infer<typeof TagSchema>
