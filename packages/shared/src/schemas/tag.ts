import { z } from 'zod'
import { HEX_COLOUR_REGEX } from '../constants/index.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

export const CreateTagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(30, 'Tag name is too long'),
  colour: z.string().regex(HEX_COLOUR_REGEX, 'Must be a hex colour, e.g. #3B82F6').nullish(),
})
export type CreateTagInput = z.infer<typeof CreateTagSchema>

export const UpdateTagSchema = z
  .object({
    name: z.string().min(1).max(30).optional(),
    colour: z.string().regex(HEX_COLOUR_REGEX).nullish(),
  })
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>

/** Public representation of a tag. */
export const TagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  colour: z.string().nullable(),
})
export type Tag = z.infer<typeof TagSchema>
