import type { Prisma } from '@prisma/client'
import type {
  CreatePantryEntryInput,
  LowStockItem,
  PantryEntry,
  UpdatePantryEntryInput,
} from '@hame/shared'
import { EXPIRY_SOON_DAYS, convertToBase } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { itemInclude, findOrCreateItemByName, toItem } from './item.service.js'
import { toStorageLocation } from './storage-location.service.js'
import { toMemberSummary } from './user.service.js'

const pantryInclude = {
  item: { include: itemInclude },
  location: true,
  addedBy: { select: { id: true, firstName: true, colour: true } },
} as const
type PantryEntryWith = Prisma.PantryEntryGetPayload<{ include: typeof pantryInclude }>

export function toPantryEntry(entry: PantryEntryWith): PantryEntry {
  return {
    id: entry.id,
    item: toItem(entry.item),
    location: toStorageLocation(entry.location),
    quantity: entry.quantity,
    unit: entry.unit,
    expiryDate: entry.expiryDate,
    addedBy: toMemberSummary(entry.addedBy),
    addedAt: entry.addedAt,
  }
}

export async function listPantryEntries(
  opts: { locationId?: string } = {},
): Promise<PantryEntry[]> {
  const entries = await prisma.pantryEntry.findMany({
    where: opts.locationId ? { locationId: opts.locationId } : undefined,
    include: pantryInclude,
    // Soonest expiry first; entries without an expiry date sort last.
    orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { addedAt: 'desc' }],
  })
  return entries.map(toPantryEntry)
}

export async function createPantryEntry(
  input: CreatePantryEntryInput,
  userId: string,
): Promise<PantryEntry> {
  const itemId = input.itemId ?? (await findOrCreateItemByName(input.itemName!, userId))
  await assertLocationExists(input.locationId)
  const entry = await prisma.pantryEntry.create({
    data: {
      itemId,
      locationId: input.locationId,
      quantity: input.quantity,
      unit: input.unit ?? null,
      expiryDate: input.expiryDate ?? null,
      addedById: userId,
    },
    include: pantryInclude,
  })
  return toPantryEntry(entry)
}

export async function updatePantryEntry(
  id: string,
  input: UpdatePantryEntryInput,
): Promise<PantryEntry> {
  await assertExists(id)
  if (input.locationId !== undefined) await assertLocationExists(input.locationId)
  const entry = await prisma.pantryEntry.update({
    where: { id },
    data: {
      ...(input.locationId !== undefined && { locationId: input.locationId }),
      ...(input.quantity !== undefined && { quantity: input.quantity }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.expiryDate !== undefined && { expiryDate: input.expiryDate }),
    },
    include: pantryInclude,
  })
  return toPantryEntry(entry)
}

export async function deletePantryEntry(id: string): Promise<void> {
  await assertExists(id)
  await prisma.pantryEntry.delete({ where: { id } })
}

/**
 * Entries expiring within `days` (inclusive), plus anything already overdue.
 * Powers the "expiring soon" dashboard widget (spec §8.12).
 */
export async function listExpiringSoon(days = EXPIRY_SOON_DAYS): Promise<PantryEntry[]> {
  const cutoff = new Date()
  cutoff.setHours(23, 59, 59, 999)
  cutoff.setDate(cutoff.getDate() + days)
  const entries = await prisma.pantryEntry.findMany({
    where: { expiryDate: { not: null, lte: cutoff } },
    include: pantryInclude,
    orderBy: { expiryDate: 'asc' },
  })
  return entries.map(toPantryEntry)
}

/**
 * Low-stock items: total pantry quantity (all entries converted to the item's
 * `baseUnit`, spec §9.2) below `minimumQuantity`. Entries whose unit can't be
 * converted are excluded from the sum and flagged, never silently added.
 */
export async function listLowStock(): Promise<LowStockItem[]> {
  const items = await prisma.item.findMany({
    where: { minimumQuantity: { not: null } },
    include: { ...itemInclude, pantryEntries: true },
    orderBy: { name: 'asc' },
  })

  const result: LowStockItem[] = []
  for (const item of items) {
    let total = 0
    let hasUnconvertibleEntries = false
    for (const entry of item.pantryEntries) {
      const converted = convertToBase(entry.quantity, entry.unit, item.baseUnit)
      if (converted === null) hasUnconvertibleEntries = true
      else total += converted
    }
    if (total < item.minimumQuantity!) {
      result.push({
        item: toItem(item),
        totalQuantity: total,
        minimumQuantity: item.minimumQuantity!,
        hasUnconvertibleEntries,
      })
    }
  }
  return result
}

// ── internals ──────────────────────────────────────────────────────────────

async function assertExists(id: string): Promise<void> {
  const existing = await prisma.pantryEntry.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Pantry entry not found')
}

async function assertLocationExists(id: string): Promise<void> {
  const existing = await prisma.storageLocation.findUnique({ where: { id } })
  if (!existing) throw HttpError.badRequest('Storage location not found')
}
