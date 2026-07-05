import { z } from 'zod'
import { LIST_STATUSES, SHOPPING_ITEM_SOURCES } from '../constants/index.js'
import { CONSUMABLE_CADENCE_STATES } from '../consumables.js'
import { ItemSchema } from './item.js'
import { MemberSummarySchema } from './user.js'

export const ShoppingItemSourceSchema = z.enum(SHOPPING_ITEM_SOURCES)

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
  /** Distinct channels merged into this line — drives the ×N badge (spec §8.3). */
  sources: z.array(ShoppingItemSourceSchema),
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

// ── Consumables (spec §8.3, §10 Phase 8.4 / 8.5) ─────────────────────────────

/**
 * A curated consumable — an `Item` flagged `isConsumable`, plus fields derived
 * live from `boughtAt` history (no new tracking). `lastBoughtAt` drives the
 * "last bought N days ago" hint; the cadence fields drive the re-order highlight
 * and the Labs auto-cadence estimate (§10 Phase 8.5):
 *
 * - `reorderIntervalDays` (on `Item`) — the manually typed cadence, always definitive.
 * - `suggestedIntervalDays` — estimated from history, or null with too little.
 * - `suggestionConfident` — whether that estimate clears the bar to auto-apply.
 * - `effectiveIntervalDays` — the cadence actually in force (manual, or auto-applied).
 * - `cadenceState` — how to label the row (manual / auto / suggested / diverged / none).
 */
export const ConsumableSchema = ItemSchema.extend({
  lastBoughtAt: z.coerce.date().nullable(),
  suggestedIntervalDays: z.number().int().nullable(),
  suggestionConfident: z.boolean(),
  effectiveIntervalDays: z.number().int().nullable(),
  cadenceState: z.enum(CONSUMABLE_CADENCE_STATES),
})
export type Consumable = z.infer<typeof ConsumableSchema>

/**
 * Add a consumable by referencing an existing Item (`itemId`) or by name
 * (`itemName`, find-or-created) — either way the item's `isConsumable` flag is
 * set. Exactly one of the two must be supplied. Optional re-order cadence.
 */
export const SetConsumableSchema = z
  .object({
    itemId: z.string().uuid().optional(),
    itemName: z.string().min(1).max(80).optional(),
    reorderIntervalDays: z.number().int().positive().max(3650).nullish(),
  })
  .refine((d) => Boolean(d.itemId) !== Boolean(d.itemName), {
    message: 'Provide either itemId or itemName, not both',
  })
export type SetConsumableInput = z.infer<typeof SetConsumableSchema>

/** Update a consumable's re-order cadence (nullable to clear it). */
export const UpdateConsumableSchema = z.object({
  reorderIntervalDays: z.number().int().positive().max(3650).nullable(),
})
export type UpdateConsumableInput = z.infer<typeof UpdateConsumableSchema>

/**
 * Fold a set of consumables into an active list from the "Add consumables"
 * checklist (spec §8.3). Each lands with the `CONSUMABLES` source, merging into
 * an existing line when compatible.
 */
export const AddConsumablesToListSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1, 'Pick at least one consumable'),
})
export type AddConsumablesToListInput = z.infer<typeof AddConsumablesToListSchema>
