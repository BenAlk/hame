import type { Prisma } from '@prisma/client'
import type {
  AddShoppingItemInput,
  ArchiveShoppingListInput,
  ArchiveShoppingListResult,
  CreateShoppingListInput,
  ListStatus,
  ShoppingItemSource,
  ShoppingList,
  ShoppingListItem,
  UpdateShoppingItemInput,
  UpdateShoppingListInput,
} from '@hame/shared'
import { convertToBase } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { itemInclude, findOrCreateItemByName, toItem } from './item.service.js'
import { toMemberSummary } from './user.service.js'

const itemRowInclude = {
  item: { include: itemInclude },
  addedBy: { select: { id: true, firstName: true, colour: true } },
} as const

const listInclude = {
  items: { include: itemRowInclude, orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.ShoppingListInclude

type ListItemRow = Prisma.ShoppingListItemGetPayload<{ include: typeof itemRowInclude }>
type ListRow = Prisma.ShoppingListGetPayload<{ include: typeof listInclude }>

function toShoppingItem(row: ListItemRow): ShoppingListItem {
  return {
    id: row.id,
    listId: row.listId,
    item: toItem(row.item),
    quantity: row.quantity,
    unit: row.unit,
    notes: row.notes,
    isBought: row.isBought,
    boughtAt: row.boughtAt,
    sources: row.sources,
    addedBy: toMemberSummary(row.addedBy),
    createdAt: row.createdAt,
  }
}

function toShoppingList(row: ListRow): ShoppingList {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdById: row.createdById,
    items: row.items.map(toShoppingItem),
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ── Lists ────────────────────────────────────────────────────────────────────

export async function listShoppingLists(
  opts: { status?: ListStatus } = {},
): Promise<ShoppingList[]> {
  const lists = await prisma.shoppingList.findMany({
    where: opts.status ? { status: opts.status } : undefined,
    include: listInclude,
    // Active lists first, then most recently touched.
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  })
  return lists.map(toShoppingList)
}

export async function getShoppingList(id: string): Promise<ShoppingList> {
  const list = await prisma.shoppingList.findUnique({ where: { id }, include: listInclude })
  if (!list) throw HttpError.notFound('Shopping list not found')
  return toShoppingList(list)
}

export async function createShoppingList(
  input: CreateShoppingListInput,
  userId: string,
): Promise<ShoppingList> {
  const list = await prisma.shoppingList.create({
    data: { name: input.name, createdById: userId },
    include: listInclude,
  })
  return toShoppingList(list)
}

export async function updateShoppingList(
  id: string,
  input: UpdateShoppingListInput,
): Promise<ShoppingList> {
  await assertActiveList(id)
  const list = await prisma.shoppingList.update({
    where: { id },
    data: { ...(input.name !== undefined && { name: input.name }) },
    include: listInclude,
  })
  return toShoppingList(list)
}

export async function deleteShoppingList(id: string): Promise<void> {
  const existing = await prisma.shoppingList.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Shopping list not found')
  await prisma.shoppingList.delete({ where: { id } }) // items cascade-delete
}

// ── List items ─────────────────────────────────────────────────────────────—

export async function addShoppingItem(
  listId: string,
  input: AddShoppingItemInput,
  userId: string,
): Promise<ShoppingListItem> {
  await assertActiveList(listId)
  const itemId = input.itemId ?? (await findOrCreateItemByName(input.itemName!, userId))

  // Fall back to the item's defaults when quantity/unit are omitted.
  const item = await prisma.item.findUnique({ where: { id: itemId } })
  if (!item) throw HttpError.badRequest('Item not found')

  const row = await mergeOrCreateLine(prisma, listId, {
    itemId,
    quantity: input.quantity ?? item.defaultQuantity ?? null,
    unit: input.unit ?? item.defaultUnit ?? null,
    notes: input.notes ?? null,
    source: 'MANUAL',
    userId,
  })
  return toShoppingItem(row)
}

/**
 * Add a quantity for `itemId` to an active list, merging into an existing
 * UNBOUGHT line for the same item when their units are compatible (spec §8.3,
 * §9.2): the quantities sum (in base units when the display units differ) and
 * the line's `sources` set unions, so it can carry the ×N merge badge.
 * Incompatible units keep separate lines. Returns the resulting row.
 *
 * Every add path (manual add, rollover, meal-plan generate, consumables) routes
 * through here so a re-added item folds into one line instead of duplicating.
 */
export async function mergeOrCreateLine(
  tx: Prisma.TransactionClient,
  listId: string,
  input: {
    itemId: string
    quantity: number | null
    unit: string | null
    notes?: string | null
    source: ShoppingItemSource
    userId: string
    rolledOverFromId?: string
  },
): Promise<ListItemRow> {
  const { itemId, quantity, unit, source, userId } = input
  const candidates = await tx.shoppingListItem.findMany({
    where: { listId, itemId, isBought: false },
    include: { item: { select: { baseUnit: true } } },
    orderBy: { createdAt: 'asc' },
  })

  for (const existing of candidates) {
    const merged = combineQuantities(
      { quantity: existing.quantity, unit: existing.unit },
      { quantity, unit },
      existing.item.baseUnit,
    )
    if (!merged) continue // units incompatible — try the next line, else create
    return tx.shoppingListItem.update({
      where: { id: existing.id },
      data: {
        quantity: merged.quantity,
        unit: merged.unit,
        ...(existing.sources.includes(source)
          ? {}
          : { sources: { set: [...existing.sources, source] } }),
      },
      include: itemRowInclude,
    })
  }

  return tx.shoppingListItem.create({
    data: {
      listId,
      itemId,
      quantity,
      unit,
      notes: input.notes ?? null,
      addedById: userId,
      sources: [source],
      ...(input.rolledOverFromId && { rolledOverFromId: input.rolledOverFromId }),
    },
    include: itemRowInclude,
  })
}

export async function updateShoppingItem(
  listId: string,
  itemRowId: string,
  input: UpdateShoppingItemInput,
): Promise<ShoppingListItem> {
  await assertActiveList(listId)
  const existing = await prisma.shoppingListItem.findUnique({ where: { id: itemRowId } })
  if (!existing || existing.listId !== listId) throw HttpError.notFound('List item not found')

  const row = await prisma.shoppingListItem.update({
    where: { id: itemRowId },
    data: {
      ...(input.quantity !== undefined && { quantity: input.quantity }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.notes !== undefined && { notes: input.notes }),
      // Toggling bought stamps/clears boughtAt to keep them consistent.
      ...(input.isBought !== undefined && {
        isBought: input.isBought,
        boughtAt: input.isBought ? new Date() : null,
      }),
    },
    include: itemRowInclude,
  })
  return toShoppingItem(row)
}

export async function removeShoppingItem(listId: string, itemRowId: string): Promise<void> {
  await assertActiveList(listId)
  const existing = await prisma.shoppingListItem.findUnique({ where: { id: itemRowId } })
  if (!existing || existing.listId !== listId) throw HttpError.notFound('List item not found')
  await prisma.shoppingListItem.delete({ where: { id: itemRowId } })
}

/**
 * Fold a set of consumables into an active list from the "Add consumables"
 * checklist (spec §8.3). Only rows that are actually consumables are added; each
 * merges via {@link mergeOrCreateLine} with the `CONSUMABLES` source.
 */
export async function addConsumablesToList(
  listId: string,
  itemIds: string[],
  userId: string,
): Promise<ShoppingList> {
  await assertActiveList(listId)
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds }, isConsumable: true },
  })
  if (items.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        await mergeOrCreateLine(tx, listId, {
          itemId: item.id,
          quantity: item.defaultQuantity ?? null,
          unit: item.defaultUnit ?? null,
          source: 'CONSUMABLES',
          userId,
        })
      }
    })
  }
  return getShoppingList(listId)
}

// ── Archive flow (spec §8.3) ─────────────────────────────────────────────────

export async function archiveShoppingList(
  id: string,
  input: ArchiveShoppingListInput,
  userId: string,
): Promise<ArchiveShoppingListResult> {
  const list = await prisma.shoppingList.findUnique({ where: { id }, include: { items: true } })
  if (!list) throw HttpError.notFound('Shopping list not found')
  if (list.status !== 'ACTIVE') throw HttpError.badRequest('This list is already archived')

  const byId = new Map(list.items.map((row) => [row.id, row]))

  // Validate every referenced item belongs to this list before writing anything.
  for (const entry of input.pantryEntries) {
    if (!byId.has(entry.shoppingItemId)) {
      throw HttpError.badRequest('A pantry item is not on this list')
    }
  }
  for (const rolloverId of input.rolloverItemIds) {
    if (!byId.has(rolloverId)) throw HttpError.badRequest('A rollover item is not on this list')
  }
  const locationIds = [...new Set(input.pantryEntries.map((e) => e.locationId))]
  if (locationIds.length > 0) {
    const found = await prisma.storageLocation.count({ where: { id: { in: locationIds } } })
    if (found !== locationIds.length) throw HttpError.badRequest('Unknown storage location')
  }

  const newListId = await prisma.$transaction(async (tx) => {
    // Stock chosen bought items into the pantry.
    for (const entry of input.pantryEntries) {
      const row = byId.get(entry.shoppingItemId)!
      await tx.pantryEntry.create({
        data: {
          itemId: row.itemId,
          locationId: entry.locationId,
          quantity: row.quantity ?? 1, // bare ticked items count as one
          unit: row.unit,
          expiryDate: entry.expiryDate ?? null,
          addedById: userId,
          fromShoppingItemId: row.id,
        },
      })
    }

    // Roll chosen unbought items over into a fresh active list. Route each
    // through the merge helper so two rolled-over rows for the same item fold
    // into one line (spec §8.3).
    let createdListId: string | null = null
    if (input.rolloverItemIds.length > 0) {
      const newList = await tx.shoppingList.create({
        data: { name: input.newListName ?? `${list.name} (continued)`, createdById: userId },
      })
      for (const rolloverId of input.rolloverItemIds) {
        const row = byId.get(rolloverId)!
        await mergeOrCreateLine(tx, newList.id, {
          itemId: row.itemId,
          quantity: row.quantity,
          unit: row.unit,
          notes: row.notes,
          source: 'ROLLOVER',
          userId: row.addedById,
          rolledOverFromId: row.id,
        })
      }
      createdListId = newList.id
    }

    await tx.shoppingList.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    })

    return createdListId
  })

  return {
    list: await getShoppingList(id),
    newList: newListId ? await getShoppingList(newListId) : null,
  }
}

// ── internals ──────────────────────────────────────────────────────────────

/** Round to 3 dp to tame floating-point drift (e.g. 0.1 + 0.2) before storing. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Case-insensitive display-unit equality; two null (unit-less) amounts match. */
function sameUnit(a: string | null, b: string | null): boolean {
  return (a?.trim().toLowerCase() ?? '') === (b?.trim().toLowerCase() ?? '')
}

/**
 * Quantity in an item's base unit, treating a unit-less amount as a bare count
 * that always sums (mirrors the meal-plan generate helper, spec §9.2).
 */
function toBase(quantity: number, unit: string | null, baseUnit: string | null): number | null {
  if (!unit) return quantity
  return convertToBase(quantity, unit, baseUnit)
}

/**
 * Combine two line quantities for the same item, or `null` when their units are
 * incompatible (caller keeps them as separate lines). A null (unspecified)
 * amount can't be summed numerically, so the concrete quantity wins and the
 * lines still merge. Matching display units sum directly; differing units only
 * merge when both convert to the item's base unit, and the sum is stored in it.
 */
function combineQuantities(
  a: { quantity: number | null; unit: string | null },
  b: { quantity: number | null; unit: string | null },
  baseUnit: string | null,
): { quantity: number | null; unit: string | null } | null {
  if (a.quantity == null || b.quantity == null) {
    return { quantity: a.quantity ?? b.quantity, unit: a.unit ?? b.unit }
  }
  if (sameUnit(a.unit, b.unit)) {
    return { quantity: round(a.quantity + b.quantity), unit: a.unit }
  }
  const aBase = toBase(a.quantity, a.unit, baseUnit)
  const bBase = toBase(b.quantity, b.unit, baseUnit)
  if (aBase === null || bBase === null) return null
  return { quantity: round(aBase + bBase), unit: baseUnit }
}

/** Load a list and ensure it's still active before mutating it. */
async function assertActiveList(id: string): Promise<void> {
  const list = await prisma.shoppingList.findUnique({ where: { id } })
  if (!list) throw HttpError.notFound('Shopping list not found')
  if (list.status !== 'ACTIVE') throw HttpError.badRequest('This list is archived')
}
