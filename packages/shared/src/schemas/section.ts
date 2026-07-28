import { z } from 'zod'
import { HEX_COLOUR_REGEX } from '../constants/index.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

export const CreateSectionSchema = z.object({
  name: z.string().min(1, 'Section name is required').max(40, 'Section name is too long'),
  colour: z.string().regex(HEX_COLOUR_REGEX, 'Must be a hex colour, e.g. #3B82F6').nullish(),
})
export type CreateSectionInput = z.infer<typeof CreateSectionSchema>

export const UpdateSectionSchema = z
  .object({
    name: z.string().min(1).max(40).optional(),
    colour: z.string().regex(HEX_COLOUR_REGEX).nullish(),
  })
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateSectionInput = z.infer<typeof UpdateSectionSchema>

/**
 * Reorder the whole set at once, as the ids in their new order.
 *
 * Whole-set rather than a "move this one to index N": walking order is only
 * meaningful as a sequence, and sending the sequence makes the server's job a
 * rewrite rather than a shuffle it has to infer. Any section left out keeps its
 * place after the ones listed.
 */
export const ReorderSectionsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one section is required'),
})
export type ReorderSectionsInput = z.infer<typeof ReorderSectionsSchema>

/** Public representation of a section. */
export const SectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  colour: z.string().nullable(),
  position: z.number().int(),
})
export type Section = z.infer<typeof SectionSchema>
