import type { Prisma } from '@prisma/client'
import type {
  AddShoppingItemInput,
  ArchiveShoppingListInput,
  ArchiveShoppingListResult,
  CreateShoppingListInput,
  ListStatus,
  ShoppingList,
  ShoppingListItem,
  UpdateShoppingItemInput,
  UpdateShoppingListInput,
} from '@hame/shared'
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

  const row = await prisma.shoppingListItem.create({
    data: {
      listId,
      itemId,
      quantity: input.quantity ?? item.defaultQuantity ?? null,
      unit: input.unit ?? item.defaultUnit ?? null,
      notes: input.notes ?? null,
      addedById: userId,
    },
    include: itemRowInclude,
  })
  return toShoppingItem(row)
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

    // Roll chosen unbought items over into a fresh active list.
    let createdListId: string | null = null
    if (input.rolloverItemIds.length > 0) {
      const newList = await tx.shoppingList.create({
        data: {
          name: input.newListName ?? `${list.name} (continued)`,
          createdById: userId,
          items: {
            create: input.rolloverItemIds.map((rolloverId) => {
              const row = byId.get(rolloverId)!
              return {
                itemId: row.itemId,
                quantity: row.quantity,
                unit: row.unit,
                notes: row.notes,
                addedById: row.addedById,
                rolledOverFromId: row.id,
              }
            }),
          },
        },
      })
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

/** Load a list and ensure it's still active before mutating it. */
async function assertActiveList(id: string): Promise<void> {
  const list = await prisma.shoppingList.findUnique({ where: { id } })
  if (!list) throw HttpError.notFound('Shopping list not found')
  if (list.status !== 'ACTIVE') throw HttpError.badRequest('This list is archived')
}
