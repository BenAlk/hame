import { z } from 'zod'
import { HEX_COLOUR_REGEX } from '../constants/index.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

export const CreateShopSchema = z.object({
  name: z.string().min(1, 'Shop name is required').max(40, 'Shop name is too long'),
  colour: z.string().regex(HEX_COLOUR_REGEX, 'Must be a hex colour, e.g. #3B82F6').nullish(),
})
export type CreateShopInput = z.infer<typeof CreateShopSchema>

export const UpdateShopSchema = z
  .object({
    name: z.string().min(1).max(40).optional(),
    colour: z.string().regex(HEX_COLOUR_REGEX).nullish(),
  })
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateShopInput = z.infer<typeof UpdateShopSchema>

/** Public representation of a shop. */
export const ShopSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  colour: z.string().nullable(),
})
export type Shop = z.infer<typeof ShopSchema>
