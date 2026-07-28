import { z } from 'zod'
import { BASE_UNITS } from '../units.js'
import { TagSchema } from './tag.js'
import { ShopSchema } from './shop.js'
import { SectionSchema } from './section.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

export const BaseUnitSchema = z.enum(BASE_UNITS)

/** Fields shared by create and update. `tagIds` fully replaces an item's tags. */
const ItemFields = z.object({
  name: z.string().min(1, 'Item name is required').max(80, 'Item name is too long'),
  defaultQuantity: z.number().positive().nullish(),
  defaultUnit: z.string().max(20).nullish(),
  baseUnit: BaseUnitSchema.nullish(),
  typicalUnitGrams: z.number().positive().nullish(),
  minimumQuantity: z.number().positive().nullish(),
  isStaple: z.boolean().optional(),
  isConsumable: z.boolean().optional(),
  reorderIntervalDays: z.number().int().positive().max(3650).nullish(),
  /** The one shop this is only buyable at; null/absent = buy anywhere (§8.3). */
  shopId: z.string().uuid().nullish(),
  /** Which part of the shop it's in; null/absent = groups under "Other" (§8.3). */
  sectionId: z.string().uuid().nullish(),
  tagIds: z.array(z.string().uuid()).optional(),
})

export const CreateItemSchema = ItemFields
export type CreateItemInput = z.infer<typeof CreateItemSchema>

export const UpdateItemSchema = ItemFields.partial().refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateItemInput = z.infer<typeof UpdateItemSchema>

/**
 * Ask for tag suggestions for an item name (spec §12 LLM auto-tagging). Takes a
 * bare name rather than an item id, so the suggestion can be had while a new
 * item is still being typed and has nothing to look up.
 */
export const SuggestTagsSchema = z.object({
  name: z.string().min(1, 'Item name is required').max(80, 'Item name is too long'),
})
export type SuggestTagsInput = z.infer<typeof SuggestTagsSchema>

/**
 * Suggested tags, always drawn from the household's **existing** pool — the
 * model chooses from what is there rather than inventing vocabulary, so this
 * can never quietly grow a second set of near-duplicate tags. `source` lets a
 * caller tell "the model had no suggestions" from "there is no model", which are
 * the same empty list but not the same situation.
 */
export const SuggestedTagsSchema = z.object({
  tags: z.array(TagSchema),
  source: z.enum(['LLM', 'UNAVAILABLE']),
})
export type SuggestedTags = z.infer<typeof SuggestedTagsSchema>

/** Public representation of an item, with its tags expanded. */
export const ItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  defaultQuantity: z.number().nullable(),
  defaultUnit: z.string().nullable(),
  baseUnit: z.string().nullable(),
  typicalUnitGrams: z.number().nullable(),
  minimumQuantity: z.number().nullable(),
  isStaple: z.boolean(),
  isConsumable: z.boolean(),
  reorderIntervalDays: z.number().nullable(),
  /** Expanded so a list row can render the shop chip without a second lookup. */
  shop: ShopSchema.nullable(),
  /** Expanded for the same reason, and it carries the position the list groups by. */
  section: SectionSchema.nullable(),
  tags: z.array(TagSchema),
  createdById: z.string().uuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type Item = z.infer<typeof ItemSchema>
