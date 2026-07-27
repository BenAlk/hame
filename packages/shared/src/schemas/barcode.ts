import { z } from 'zod'
import { ItemSchema } from './item.js'

/**
 * A scanned code as digits: EAN-8 (8), UPC-A (12), EAN-13 (13) and GTIN-14 (14)
 * all land in this range. Validated as a shape, not a checksum — a scanner that
 * read a real product is more trustworthy than our arithmetic, and a household
 * typing one in by hand shouldn't be lectured about check digits.
 */
export const BarcodeSchema = z
  .string()
  .trim()
  .regex(/^\d{8,14}$/, 'A barcode is 8–14 digits')
export type Barcode = z.infer<typeof BarcodeSchema>

/** What an external lookup could tell us about an unrecognised code. */
export const BarcodeSuggestionSchema = z.object({
  name: z.string(),
  brand: z.string().nullable(),
  /** Pack size as the source words it, e.g. "2 l" — display only, never parsed. */
  quantity: z.string().nullable(),
})
export type BarcodeSuggestion = z.infer<typeof BarcodeSuggestionSchema>

/**
 * The answer to "what is this code?". Exactly one of these outcomes matters to
 * the UI, in order: a linked `item` (instant, nothing left the network), else a
 * `match` to confirm, else a `suggestion` to name, else nothing — type the name
 * and the code is still learned. `lookupEnabled` lets the UI explain a missing
 * suggestion rather than look broken.
 */
export const BarcodeResolutionSchema = z.object({
  code: BarcodeSchema,
  item: ItemSchema.nullable(),
  suggestion: BarcodeSuggestionSchema.nullable(),
  /**
   * The generic shopping name behind a branded product — "Tesco British Semi
   * Skimmed Milk 2.272L" reduced to "semi skimmed milk". This is what keeps a
   * growing barcode library from fragmenting one concept into a row per brand
   * (§9.2). Null when there was no suggestion to reduce.
   */
  canonicalName: z.string().nullable(),
  /**
   * An existing item that name matched, which the scan review offers **before**
   * creating anything — the "suggest and match, never auto-create" half of §8.4
   * that the first cut left to the user's typing.
   */
  match: ItemSchema.nullable(),
  lookupEnabled: z.boolean(),
})
export type BarcodeResolution = z.infer<typeof BarcodeResolutionSchema>

/**
 * Link a code to an item — an existing one by `itemId` (the suggest-and-match
 * default, keeping `Item` generic) or a new one by `itemName`.
 */
export const LinkBarcodeSchema = z
  .object({
    code: BarcodeSchema,
    itemId: z.string().uuid().optional(),
    itemName: z.string().min(1).max(80).optional(),
    /** The looked-up product name, kept so a multi-barcode item stays legible. */
    label: z.string().max(200).nullish(),
  })
  .refine((d) => Boolean(d.itemId) !== Boolean(d.itemName), {
    message: 'Provide either itemId or itemName, not both',
  })
export type LinkBarcodeInput = z.infer<typeof LinkBarcodeSchema>

/** A barcode known to this household, as shown against its item. */
export const ItemBarcodeSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  itemId: z.string().uuid(),
  label: z.string().nullable(),
  addedAt: z.coerce.date(),
})
export type ItemBarcode = z.infer<typeof ItemBarcodeSchema>
