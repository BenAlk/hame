import type { Prisma } from '@prisma/client'
import type { CreateItemInput, Item, SuggestedTags, UpdateItemInput } from '@hame/shared'
import { QUICK_ADD_TAG } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { getLlm } from './normaliser.service.js'
import { toTag } from './tag.service.js'
import { toShop } from './shop.service.js'

/** Always load an item with its tags and shop expanded — the only public shape. */
export const itemInclude = { tags: { orderBy: { name: 'asc' } }, shop: true } as const
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
    shop: item.shop ? toShop(item.shop) : null,
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
      shopId: input.shopId ?? null,
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
      // null is meaningful here — it clears the shop back to "buy anywhere".
      ...(input.shopId !== undefined && { shopId: input.shopId }),
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

/**
 * Suggest tags for an item name from the household's existing pool (spec §12).
 *
 * The pool is the whole point: suggestions are a *choice* from the tags that
 * exist, never new vocabulary, so this can't quietly grow a second set of
 * near-duplicates alongside the ones in use. An empty pool, or no configured
 * model, is reported as `UNAVAILABLE` rather than as "no tags apply" — the same
 * empty list, but not the same situation for a caller to explain.
 */
export async function suggestTags(name: string): Promise<SuggestedTags> {
  const llm = await getLlm()
  if (!llm) return { tags: [], source: 'UNAVAILABLE' }

  const pool = await prisma.tag.findMany({ orderBy: { name: 'asc' } })
  if (pool.length === 0) return { tags: [], source: 'UNAVAILABLE' }

  const chosen = await llm.suggestTags(
    name.trim(),
    pool.map((t) => t.name),
  )
  const byName = new Map(pool.map((t) => [t.name, t]))
  return {
    tags: chosen.flatMap((tagName) => {
      const tag = byName.get(tagName)
      return tag ? [toTag(tag)] : []
    }),
    source: 'LLM',
  }
}

/**
 * Find an item matching any of `names`, case-insensitively, returning the one
 * whose name appears **earliest** in the list. Callers pass candidates in
 * best-first order, so the priority is theirs to state rather than the
 * database's to guess — and one query answers all of them.
 */
export async function findItemByNames(names: string[]): Promise<Item | null> {
  const candidates = names.map((n) => n.trim()).filter(Boolean)
  if (candidates.length === 0) return null

  const found = await prisma.item.findMany({
    where: { OR: candidates.map((name) => ({ name: { equals: name, mode: 'insensitive' } })) },
    include: itemInclude,
  })
  if (found.length === 0) return null

  const rank = new Map(candidates.map((name, i) => [name.toLowerCase(), i]))
  const best = found.reduce((a, b) =>
    (rank.get(a.name.toLowerCase()) ?? Infinity) <= (rank.get(b.name.toLowerCase()) ?? Infinity)
      ? a
      : b,
  )
  return toItem(best)
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
