import { z } from 'zod'
import { LIST_STATUSES } from '../constants/index.js'
import { ItemSchema } from './item.js'
import { MemberSummarySchema } from './user.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

export const ListStatusSchema = z.enum(LIST_STATUSES)

// ── Lists ────────────────────────────────────────────────────────────────────

export const CreateShoppingListSchema = z.object({
  name: z.string().min(1, 'List name is required').max(60, 'List name is too long'),
})
export type CreateShoppingListInput = z.infer<typeof CreateShoppingListSchema>

export const UpdateShoppingListSchema = z
  .object({ name: z.string().min(1).max(60).optional() })
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateShoppingListInput = z.infer<typeof UpdateShoppingListSchema>

// ── List items ─────────────────────────────────────────────────────────────—

/**
 * Add an item to a list by referencing an existing Item (`itemId`) or by name
 * (`itemName`, find-or-created server-side for free-text quick adds). Exactly
 * one of the two must be supplied.
 */
export const AddShoppingItemSchema = z
  .object({
    itemId: z.string().uuid().optional(),
    itemName: z.string().min(1).max(80).optional(),
    quantity: z.number().positive().nullish(),
    unit: z.string().max(20).nullish(),
    notes: z.string().max(200).nullish(),
  })
  .refine((d) => Boolean(d.itemId) !== Boolean(d.itemName), {
    message: 'Provide either itemId or itemName, not both',
  })
export type AddShoppingItemInput = z.infer<typeof AddShoppingItemSchema>

export const UpdateShoppingItemSchema = z
  .object({
    quantity: z.number().positive().nullish(),
    unit: z.string().max(20).nullish(),
    notes: z.string().max(200).nullish(),
    isBought: z.boolean().optional(),
  })
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateShoppingItemInput = z.infer<typeof UpdateShoppingItemSchema>

// ── Archive flow (spec §8.3) ─────────────────────────────────────────────────

/**
 * Archive a list: bought items the user chooses to stock become PantryEntry
 * rows; chosen unbought items roll over into a new active list.
 */
export const ArchiveShoppingListSchema = z.object({
  /** Bought items to add to the pantry, each with a destination + optional expiry. */
  pantryEntries: z
    .array(
      z.object({
        shoppingItemId: z.string().uuid(),
        locationId: z.string().uuid(),
        expiryDate: z.coerce.date().nullish(),
      }),
    )
    .default([]),
  /** Unbought items to carry over to a fresh list. */
  rolloverItemIds: z.array(z.string().uuid()).default([]),
  /** Name for the rollover list (defaults applied server-side when omitted). */
  newListName: z.string().min(1).max(60).optional(),
})
export type ArchiveShoppingListInput = z.infer<typeof ArchiveShoppingListSchema>

// ── Public shapes ────────────────────────────────────────────────────────────

export const ShoppingListItemSchema = z.object({
  id: z.string().uuid(),
  listId: z.string().uuid(),
  item: ItemSchema,
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  notes: z.string().nullable(),
  isBought: z.boolean(),
  boughtAt: z.coerce.date().nullable(),
  addedBy: MemberSummarySchema,
  createdAt: z.coerce.date(),
})
export type ShoppingListItem = z.infer<typeof ShoppingListItemSchema>

export const ShoppingListSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: ListStatusSchema,
  createdById: z.string().uuid(),
  items: z.array(ShoppingListItemSchema),
  archivedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type ShoppingList = z.infer<typeof ShoppingListSchema>

/** Result of archiving a list: the archived list + any rollover list created. */
export interface ArchiveShoppingListResult {
  list: ShoppingList
  newList: ShoppingList | null
}
