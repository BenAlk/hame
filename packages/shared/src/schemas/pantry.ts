import { z } from 'zod'
import { ItemSchema } from './item.js'
import { MemberSummarySchema } from './user.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

// ── Storage locations ────────────────────────────────────────────────────────

export const CreateStorageLocationSchema = z.object({
  name: z.string().min(1, 'Location name is required').max(40, 'Location name is too long'),
  icon: z.string().max(40).nullish(),
})
export type CreateStorageLocationInput = z.infer<typeof CreateStorageLocationSchema>

export const UpdateStorageLocationSchema = z
  .object({
    name: z.string().min(1).max(40).optional(),
    icon: z.string().max(40).nullish(),
  })
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateStorageLocationInput = z.infer<typeof UpdateStorageLocationSchema>

export const StorageLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  icon: z.string().nullable(),
})
export type StorageLocation = z.infer<typeof StorageLocationSchema>

// ── Pantry entries ─────────────────────────────────────────────────────────—

/** Add stock by referencing an existing Item (`itemId`) or by name (`itemName`). */
export const CreatePantryEntrySchema = z
  .object({
    itemId: z.string().uuid().optional(),
    itemName: z.string().min(1).max(80).optional(),
    locationId: z.string().uuid(),
    quantity: z.number().positive('Quantity must be greater than zero'),
    unit: z.string().max(20).nullish(),
    expiryDate: z.coerce.date().nullish(),
  })
  .refine((d) => Boolean(d.itemId) !== Boolean(d.itemName), {
    message: 'Provide either itemId or itemName, not both',
  })
export type CreatePantryEntryInput = z.infer<typeof CreatePantryEntrySchema>

/**
 * Stock several entries at once — the commit at the end of a barcode batch
 * (spec §10 Phase 14). Applied in one transaction so a partly-stocked shop is
 * never left behind; the cap is a sanity bound on one unpacking session.
 */
export const BulkCreatePantryEntriesSchema = z.object({
  entries: z.array(CreatePantryEntrySchema).min(1, 'Nothing to stock').max(100),
})
export type BulkCreatePantryEntriesInput = z.infer<typeof BulkCreatePantryEntriesSchema>

export const UpdatePantryEntrySchema = z
  .object({
    locationId: z.string().uuid().optional(),
    quantity: z.number().positive().optional(),
    unit: z.string().max(20).nullish(),
    expiryDate: z.coerce.date().nullish(),
  })
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdatePantryEntryInput = z.infer<typeof UpdatePantryEntrySchema>

export const PantryEntrySchema = z.object({
  id: z.string().uuid(),
  item: ItemSchema,
  location: StorageLocationSchema,
  quantity: z.number(),
  unit: z.string().nullable(),
  expiryDate: z.coerce.date().nullable(),
  addedBy: MemberSummarySchema,
  addedAt: z.coerce.date(),
})
export type PantryEntry = z.infer<typeof PantryEntrySchema>

// ── Derived widget shapes ────────────────────────────────────────────────────

/** A low-stock item: total stock (in baseUnit) below its minimumQuantity. */
export const LowStockItemSchema = z.object({
  item: ItemSchema,
  totalQuantity: z.number(), // summed in baseUnit
  minimumQuantity: z.number(),
  /** True when some entries were excluded from the sum (incompatible units). */
  hasUnconvertibleEntries: z.boolean(),
})
export type LowStockItem = z.infer<typeof LowStockItemSchema>
