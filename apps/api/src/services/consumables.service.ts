import type { Consumable, SetConsumableInput, UpdateConsumableInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { itemInclude, findOrCreateItemByName, toItem } from './item.service.js'

/**
 * Consumables (spec §8.3, §10 Phase 8.4) are just `Item`s flagged
 * `isConsumable` — the curated household re-order checklist. There's no separate
 * table: "last bought N days ago" is derived live from the newest `boughtAt`
 * across archived lists, so nothing extra is tracked.
 */

/** List every consumable with its live last-bought date, newest-purchase first. */
export async function listConsumables(): Promise<Consumable[]> {
  const items = await prisma.item.findMany({
    where: { isConsumable: true },
    include: itemInclude,
    orderBy: { name: 'asc' },
  })
  if (items.length === 0) return []

  // Newest purchase per item across every (archived or active) bought line.
  const bought = await prisma.shoppingListItem.groupBy({
    by: ['itemId'],
    where: { itemId: { in: items.map((i) => i.id) }, isBought: true },
    _max: { boughtAt: true },
  })
  const lastBoughtByItem = new Map(bought.map((b) => [b.itemId, b._max.boughtAt]))

  return items.map((item) => ({
    ...toItem(item),
    lastBoughtAt: lastBoughtByItem.get(item.id) ?? null,
  }))
}

/**
 * Add a consumable by id or free-text name (find-or-created), setting its
 * `isConsumable` flag in one gesture. An optional re-order cadence is stored too.
 */
export async function setConsumable(
  input: SetConsumableInput,
  userId: string,
): Promise<Consumable> {
  const itemId = input.itemId ?? (await findOrCreateItemByName(input.itemName!, userId))
  const existing = await prisma.item.findUnique({ where: { id: itemId } })
  if (!existing) throw HttpError.badRequest('Item not found')

  await prisma.item.update({
    where: { id: itemId },
    data: {
      isConsumable: true,
      ...(input.reorderIntervalDays !== undefined && {
        reorderIntervalDays: input.reorderIntervalDays,
      }),
    },
  })
  return getConsumable(itemId)
}

/** Update a consumable's re-order cadence. */
export async function updateConsumable(
  itemId: string,
  input: UpdateConsumableInput,
): Promise<Consumable> {
  await assertConsumable(itemId)
  await prisma.item.update({
    where: { id: itemId },
    data: { reorderIntervalDays: input.reorderIntervalDays },
  })
  return getConsumable(itemId)
}

/** Remove a consumable from the checklist by unsetting the flag; the Item survives. */
export async function removeConsumable(itemId: string): Promise<void> {
  await assertConsumable(itemId)
  await prisma.item.update({ where: { id: itemId }, data: { isConsumable: false } })
}

// ── internals ──────────────────────────────────────────────────────────────

async function getConsumable(itemId: string): Promise<Consumable> {
  const item = await prisma.item.findUnique({ where: { id: itemId }, include: itemInclude })
  if (!item) throw HttpError.notFound('Consumable not found')
  const bought = await prisma.shoppingListItem.aggregate({
    where: { itemId, isBought: true },
    _max: { boughtAt: true },
  })
  return { ...toItem(item), lastBoughtAt: bought._max.boughtAt ?? null }
}

async function assertConsumable(itemId: string): Promise<void> {
  const item = await prisma.item.findUnique({ where: { id: itemId } })
  if (!item || !item.isConsumable) throw HttpError.notFound('Consumable not found')
}
