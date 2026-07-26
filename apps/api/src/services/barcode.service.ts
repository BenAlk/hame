import type { BarcodeResolution, LinkBarcodeInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { lookupBarcode } from '../integrations/open-food-facts/index.js'
import { getHouseholdSettings } from './household-settings.service.js'
import { findOrCreateItemByName, itemInclude, toItem } from './item.service.js'

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
      lookupEnabled: barcodeLookupEnabled,
    }
  }

  return {
    code,
    item: null,
    suggestion: barcodeLookupEnabled ? await lookupBarcode(code) : null,
    lookupEnabled: barcodeLookupEnabled,
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
