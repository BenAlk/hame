import type { Consumable, SetConsumableInput, UpdateConsumableInput } from '@hame/shared'
import {
  consumableCadenceState,
  effectiveReorderInterval,
  suggestReorderInterval,
} from '@hame/shared'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { itemInclude, findOrCreateItemByName, toItem } from './item.service.js'
import { getHouseholdSettings } from './household-settings.service.js'

/**
 * Consumables (spec §8.3, §10 Phase 8.4 / 8.5) are just `Item`s flagged
 * `isConsumable` — the curated household re-order checklist. There's no separate
 * table: both "last bought N days ago" and the auto-cadence estimate are derived
 * live from the `boughtAt` history, so nothing extra is tracked. The estimate
 * only ever surfaces when the household's Labs toggle is on (§10 Phase 8.5).
 */

type ItemWithTags = Prisma.ItemGetPayload<{ include: typeof itemInclude }>

/**
 * Assemble a consumable's public shape from its item row and its purchase-day
 * history. Computes the live last-bought date and — from the same history — the
 * cadence suggestion, the effective (in-force) cadence and its UI state. The
 * suggestion is only allowed to auto-apply when `autoEnabled` (the Labs toggle).
 */
function buildConsumable(
  item: ItemWithTags,
  boughtDates: Date[],
  autoEnabled: boolean,
): Consumable {
  const lastBoughtAt =
    boughtDates.length === 0
      ? null
      : boughtDates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b))
  // Off = manual only: don't even compute (let alone surface) an estimate.
  const suggestion = autoEnabled ? suggestReorderInterval(boughtDates) : null
  const manual = item.reorderIntervalDays
  return {
    ...toItem(item),
    lastBoughtAt,
    suggestedIntervalDays: suggestion?.days ?? null,
    suggestionConfident: suggestion?.confident ?? false,
    effectiveIntervalDays: effectiveReorderInterval({ manual, suggestion }, autoEnabled),
    cadenceState: consumableCadenceState({ manual, suggestion }, autoEnabled),
  }
}

/** Every dated bought line for the given items, grouped into per-item purchase histories. */
async function boughtHistoryByItem(itemIds: string[]): Promise<Map<string, Date[]>> {
  const rows = await prisma.shoppingListItem.findMany({
    where: { itemId: { in: itemIds }, isBought: true, boughtAt: { not: null } },
    select: { itemId: true, boughtAt: true },
  })
  const byItem = new Map<string, Date[]>()
  for (const row of rows) {
    if (!row.boughtAt) continue
    const dates = byItem.get(row.itemId)
    if (dates) dates.push(row.boughtAt)
    else byItem.set(row.itemId, [row.boughtAt])
  }
  return byItem
}

/** List every consumable with its live last-bought date and cadence state, name-sorted. */
export async function listConsumables(): Promise<Consumable[]> {
  const items = await prisma.item.findMany({
    where: { isConsumable: true },
    include: itemInclude,
    orderBy: { name: 'asc' },
  })
  if (items.length === 0) return []

  const autoEnabled = (await getHouseholdSettings()).autoConsumableCadence
  const historyByItem = await boughtHistoryByItem(items.map((i) => i.id))

  return items.map((item) => buildConsumable(item, historyByItem.get(item.id) ?? [], autoEnabled))
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
  const autoEnabled = (await getHouseholdSettings()).autoConsumableCadence
  const history = (await boughtHistoryByItem([itemId])).get(itemId) ?? []
  return buildConsumable(item, history, autoEnabled)
}

async function assertConsumable(itemId: string): Promise<void> {
  const item = await prisma.item.findUnique({ where: { id: itemId } })
  if (!item || !item.isConsumable) throw HttpError.notFound('Consumable not found')
}
