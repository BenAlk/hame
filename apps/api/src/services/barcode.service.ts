import type { BarcodeResolution, BarcodeSuggestion, Item, LinkBarcodeInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { lookupBarcode, stripBrand } from '../integrations/open-food-facts/index.js'
import { getHouseholdSettings } from './household-settings.service.js'
import { findItemByNames, findOrCreateItemByName, itemInclude, toItem } from './item.service.js'
import { getLlm } from './normaliser.service.js'

/**
 * Answer "what is this code?" (spec §8.4). Resolution order is the whole point:
 *
 *  1. A previously linked `ItemBarcode` — instant, offline, nothing leaves the
 *     network. This is the common case after the first shop.
 *  2. Otherwise an Open Food Facts lookup, if the household allows it.
 *  3. Otherwise nothing — the caller types a name, and linking still teaches us
 *     the code, so the next scan takes path 1.
 */
export async function resolveBarcode(code: string): Promise<BarcodeResolution> {
  const known = await prisma.itemBarcode.findUnique({
    where: { code },
    include: { item: { include: itemInclude } },
  })
  const { barcodeLookupEnabled } = await getHouseholdSettings()

  if (known) {
    return {
      code,
      item: toItem(known.item),
      suggestion: null,
      canonicalName: null,
      match: null,
      lookupEnabled: barcodeLookupEnabled,
    }
  }

  const suggestion = barcodeLookupEnabled ? await lookupBarcode(code) : null
  const { canonicalName, match } = await resolveProductName(suggestion)

  return { code, item: null, suggestion, canonicalName, match, lookupEnabled: barcodeLookupEnabled }
}

/**
 * Turn a branded packet name into the generic name an `Item` should carry, and
 * find any existing item it names (spec §8.4).
 *
 * A supermarket name fragments the pantry if taken literally: "Tesco British
 * Semi Skimmed Milk 2.272L", "Arla Semi Skimmed Milk 1L" and "milk" are one
 * concept, and letting each become its own `Item` breaks recipe linking and
 * low-stock aggregation (§9.2). So the packet name is reduced first — by the
 * deterministic strip always, then by the model when one is configured — and
 * the result is looked up against what the household already has.
 *
 * Candidates are tried most-canonical first, so a household that already has
 * "milk" matches it rather than minting "British Semi Skimmed Milk". Every step
 * is optional: no model leaves the deterministic name, no match leaves a better
 * name to pre-fill, and the scan works either way.
 */
async function resolveProductName(
  suggestion: BarcodeSuggestion | null,
): Promise<{ canonicalName: string | null; match: Item | null }> {
  if (!suggestion) return { canonicalName: null, match: null }

  const stripped = stripBrand(suggestion.name, suggestion.brand)
  const llm = await getLlm()
  const canonical = (await llm?.canonicaliseProduct(suggestion.name)) ?? null

  const candidates = [canonical, stripped, suggestion.name].filter(
    (n): n is string => typeof n === 'string' && n.trim().length > 0,
  )
  return {
    canonicalName: candidates[0] ?? null,
    match: await findItemByNames(candidates),
  }
}

/**
 * Teach the household a code, against an existing item or a newly named one.
 * Re-linking an already-known code re-points it rather than failing: rescanning
 * something filed under the wrong item is the natural way to correct it.
 */
export async function linkBarcode(input: LinkBarcodeInput, userId: string): Promise<void> {
  const itemId = input.itemId ?? (await findOrCreateItemByName(input.itemName!, userId))

  if (input.itemId) {
    const item = await prisma.item.findUnique({ where: { id: input.itemId } })
    if (!item) throw HttpError.notFound('Item not found')
  }

  await prisma.itemBarcode.upsert({
    where: { code: input.code },
    update: { itemId, label: input.label ?? null },
    create: { code: input.code, itemId, label: input.label ?? null },
  })
}

/** Forget a code — the item and its history are untouched. */
export async function unlinkBarcode(code: string): Promise<void> {
  const existing = await prisma.itemBarcode.findUnique({ where: { code } })
  if (!existing) throw HttpError.notFound('Barcode not found')
  await prisma.itemBarcode.delete({ where: { code } })
}
