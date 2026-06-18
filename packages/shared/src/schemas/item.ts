import { z } from 'zod'
import { BASE_UNITS } from '../units.js'
import { TagSchema } from './tag.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

export const BaseUnitSchema = z.enum(BASE_UNITS)

/** Fields shared by create and update. `tagIds` fully replaces an item's tags. */
const ItemFields = z.object({
  name: z.string().min(1, 'Item name is required').max(80, 'Item name is too long'),
  defaultQuantity: z.number().positive().nullish(),
  defaultUnit: z.string().max(20).nullish(),
  baseUnit: BaseUnitSchema.nullish(),
  minimumQuantity: z.number().positive().nullish(),
  isStaple: z.boolean().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
})

export const CreateItemSchema = ItemFields
export type CreateItemInput = z.infer<typeof CreateItemSchema>

export const UpdateItemSchema = ItemFields.partial().refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateItemInput = z.infer<typeof UpdateItemSchema>

/** Public representation of an item, with its tags expanded. */
export const ItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  defaultQuantity: z.number().nullable(),
  defaultUnit: z.string().nullable(),
  baseUnit: z.string().nullable(),
  minimumQuantity: z.number().nullable(),
  isStaple: z.boolean(),
  tags: z.array(TagSchema),
  createdById: z.string().uuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type Item = z.infer<typeof ItemSchema>
