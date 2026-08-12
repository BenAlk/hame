import type { Prisma } from '@prisma/client'
import type {
  CreateItemInput,
  Item,
  SuggestedSection,
  SuggestedStorageType,
  SuggestedTags,
  UpdateItemInput,
} from '@hame/shared'
import { QUICK_ADD_TAG, SUGGESTIBLE_TAG_KINDS } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { getLlm } from './normaliser.service.js'
import { toTag } from './tag.service.js'
import { toShop } from './shop.service.js'
import { toSection } from './section.service.js'

/** Always load an item with its tags and shop expanded — the only public shape. */
export const itemInclude = {
  tags: { orderBy: { name: 'asc' } },
  shop: true,
  section: true,
} as const
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
    section: item.section ? toSection(item.section) : null,
    storageType: item.storageType,
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
      sectionId: input.sectionId ?? null,
      storageType: input.storageType ?? null,
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
      // Likewise null, which returns the item to the list's "Other" group.
      ...(input.sectionId !== undefined && { sectionId: input.sectionId }),
      ...(input.storageType !== undefined && { storageType: input.storageType }),
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
 *
 * What the model may choose from is narrowed by `kind` (§10 Phase 24): only tags
 * that describe a *product*. That is a query rather than a subtraction — the
 * by-name withholding it replaced had to anticipate each wrong answer, and duly
 * missed a household's own "lactose-free".
 */
export async function suggestTags(name: string): Promise<SuggestedTags> {
  const llm = await getLlm()
  if (!llm) return { tags: [], source: 'UNAVAILABLE' }

  const pool = await prisma.tag.findMany({
    where: { kind: { in: [...SUGGESTIBLE_TAG_KINDS] } },
    orderBy: { name: 'asc' },
  })
  if (pool.length === 0) return { tags: [], source: 'UNAVAILABLE' }

  let chosen: string[]
  try {
    chosen = await llm.suggestTags(
      name.trim(),
      pool.map((t) => t.name),
    )
  } catch {
    // A call that never completed is not "nothing applies" — most often a cold
    // model still loading, which is worth saying so it can simply be retried.
    return { tags: [], source: 'FAILED' }
  }

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
 * Suggest which section of the shop an item belongs in (spec §8.3).
 *
 * The sibling of {@link suggestTags}, and the easier of the two to make safe: a
 * section is **single-valued**, so the model returns one choice from a closed
 * list. Tags had to defend against a set containing an invented near-duplicate;
 * here the only two outcomes are one of the household's sections or nothing.
 *
 * The pool goes down in **walking order**, not alphabetically — it is the order
 * the household reads its own shop in, so it is the order to reason about.
 * `source` separates "no model, or nothing to choose from" from "the model
 * declined", which are the same null but not the same thing to explain.
 */
export async function suggestSection(name: string): Promise<SuggestedSection> {
  const llm = await getLlm()
  if (!llm) return { section: null, source: 'UNAVAILABLE' }

  const pool = await prisma.section.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] })
  if (pool.length === 0) return { section: null, source: 'UNAVAILABLE' }

  let chosen: string | null
  try {
    chosen = await llm.suggestSection(
      name.trim(),
      pool.map((section) => section.name),
    )
  } catch {
    // Distinct from the model declining: nothing was decided, so say so rather
    // than claim it couldn't be placed.
    return { section: null, source: 'FAILED' }
  }

  const match = chosen
    ? pool.find((section) => section.name.toLowerCase() === chosen.toLowerCase())
    : undefined
  return { section: match ? toSection(match) : null, source: 'LLM' }
}

/**
 * Suggest how an item is kept (spec §10 Phase 25).
 *
 * The third constrained sibling, and the simplest: the choices are a project
 * constant, so there is no pool to fetch and no empty-pool case to report.
 * `UNAVAILABLE` here can only mean "no model configured".
 *
 * This replaces asking the model to pick storage words out of a tag pool, which
 * it could not do reliably — the set is mutually exclusive and a tag reply is
 * not, so it returned two, or answered by whichever it read first.
 */
export async function suggestStorageType(name: string): Promise<SuggestedStorageType> {
  const llm = await getLlm()
  if (!llm) return { storageType: null, source: 'UNAVAILABLE' }

  try {
    return { storageType: await llm.suggestStorageType(name.trim()), source: 'LLM' }
  } catch {
    // Same distinction as its siblings: a call that never completed is not the
    // model saying it cannot tell.
    return { storageType: null, source: 'FAILED' }
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
