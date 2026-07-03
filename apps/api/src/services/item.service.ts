import type { Prisma } from '@prisma/client'
import type { CreateItemInput, Item, UpdateItemInput } from '@hame/shared'
import { QUICK_ADD_TAG } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { toTag } from './tag.service.js'

/** Always load an item with its tags expanded — the only public shape. */
export const itemInclude = { tags: { orderBy: { name: 'asc' } } } as const
type ItemWithTags = Prisma.ItemGetPayload<{ include: typeof itemInclude }>

export function toItem(item: ItemWithTags): Item {
  return {
    id: item.id,
    name: item.name,
    defaultQuantity: item.defaultQuantity,
    defaultUnit: item.defaultUnit,
    baseUnit: item.baseUnit,
    typicalUnitGrams: item.typicalUnitGrams,
    minimumQuantity: item.minimumQuantity,
    isStaple: item.isStaple,
    isConsumable: item.isConsumable,
    reorderIntervalDays: item.reorderIntervalDays,
    tags: item.tags.map(toTag),
    createdById: item.createdById,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

/** List items, optionally limited to those carrying the `quick-add` tag. */
export async function listItems(opts: { quickAdd?: boolean } = {}): Promise<Item[]> {
  const items = await prisma.item.findMany({
    where: opts.quickAdd ? { tags: { some: { name: QUICK_ADD_TAG } } } : undefined,
    include: itemInclude,
    orderBy: { name: 'asc' },
  })
  return items.map(toItem)
}

export async function getItem(id: string): Promise<Item> {
  const item = await prisma.item.findUnique({ where: { id }, include: itemInclude })
  if (!item) throw HttpError.notFound('Item not found')
  return toItem(item)
}

export async function createItem(input: CreateItemInput, userId: string): Promise<Item> {
  await assertNameAvailable(input.name)
  const item = await prisma.item.create({
    data: {
      name: input.name,
      defaultQuantity: input.defaultQuantity ?? null,
      defaultUnit: input.defaultUnit ?? null,
      baseUnit: input.baseUnit ?? null,
      typicalUnitGrams: input.typicalUnitGrams ?? null,
      minimumQuantity: input.minimumQuantity ?? null,
      isStaple: input.isStaple ?? false,
      isConsumable: input.isConsumable ?? false,
      reorderIntervalDays: input.reorderIntervalDays ?? null,
      createdById: userId,
      ...(input.tagIds && { tags: { connect: input.tagIds.map((id) => ({ id })) } }),
    },
    include: itemInclude,
  })
  return toItem(item)
}

export async function updateItem(id: string, input: UpdateItemInput): Promise<Item> {
  await assertExists(id)
  if (input.name !== undefined) await assertNameAvailable(input.name, id)
  const item = await prisma.item.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.defaultQuantity !== undefined && { defaultQuantity: input.defaultQuantity }),
      ...(input.defaultUnit !== undefined && { defaultUnit: input.defaultUnit }),
      ...(input.baseUnit !== undefined && { baseUnit: input.baseUnit }),
      ...(input.typicalUnitGrams !== undefined && { typicalUnitGrams: input.typicalUnitGrams }),
      ...(input.minimumQuantity !== undefined && { minimumQuantity: input.minimumQuantity }),
      ...(input.isStaple !== undefined && { isStaple: input.isStaple }),
      ...(input.isConsumable !== undefined && { isConsumable: input.isConsumable }),
      ...(input.reorderIntervalDays !== undefined && {
        reorderIntervalDays: input.reorderIntervalDays,
      }),
      // `tagIds` fully replaces the item's tag set when present.
      ...(input.tagIds && { tags: { set: input.tagIds.map((tid) => ({ id: tid })) } }),
    },
    include: itemInclude,
  })
  return toItem(item)
}

export async function deleteItem(id: string): Promise<void> {
  const item = await prisma.item.findUnique({
    where: { id },
    include: { _count: { select: { shoppingItems: true, pantryEntries: true } } },
  })
  if (!item) throw HttpError.notFound('Item not found')
  if (item._count.shoppingItems > 0 || item._count.pantryEntries > 0) {
    throw HttpError.conflict('This item is in use on a shopping list or in the pantry')
  }
  await prisma.item.delete({ where: { id } })
}

/**
 * Resolve an item by free-text name, creating it (untagged) if new. Used by the
 * shopping/pantry quick-add and recipe-import flows. Matching is
 * case-insensitive. `defaults` (a base unit inferred from the ingredient's unit,
 * a staple flag) are only applied when the item is freshly minted — never
 * overwriting an existing item's settings.
 */
export async function findOrCreateItemByName(
  name: string,
  userId: string,
  defaults: { baseUnit?: string | null; isStaple?: boolean; typicalUnitGrams?: number | null } = {},
): Promise<string> {
  const trimmed = name.trim()
  const existing = await prisma.item.findFirst({
    where: { name: { equals: trimmed, mode: 'insensitive' } },
  })
  if (existing) return existing.id
  const created = await prisma.item.create({
    data: {
      name: trimmed,
      createdById: userId,
      baseUnit: defaults.baseUnit ?? null,
      isStaple: defaults.isStaple ?? false,
      typicalUnitGrams: defaults.typicalUnitGrams ?? null,
    },
  })
  return created.id
}

// ── internals ──────────────────────────────────────────────────────────────

async function assertExists(id: string): Promise<void> {
  const existing = await prisma.item.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Item not found')
}

async function assertNameAvailable(name: string, exceptId?: string): Promise<void> {
  const existing = await prisma.item.findFirst({
    where: { name: { equals: name.trim(), mode: 'insensitive' } },
  })
  if (existing && existing.id !== exceptId)
    throw HttpError.conflict('An item with that name exists')
}
