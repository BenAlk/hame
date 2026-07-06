import type { Prisma } from '@prisma/client'
import type {
  ClearMealPlanInput,
  CreateMealPlanEntryInput,
  GenerateMealPlanInput,
  GenerateShoppingListInput,
  GenerateShoppingListResult,
  MealPlanEntry,
  PreviewShoppingListInput,
  ShoppingListPreview,
  UpdateMealPlanEntryInput,
} from '@hame/shared'
import { convertToBase, DEFAULT_SERVINGS } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { toTag } from './tag.service.js'
import { toMemberSummary } from './user.service.js'
import { getShoppingList, mergeOrCreateLine } from './shopping.service.js'

const memberSelect = { select: { id: true, firstName: true, colour: true } } as const

const entryInclude = {
  recipe: {
    include: { tags: { orderBy: { name: 'asc' } } },
  },
  createdBy: memberSelect,
} as const satisfies Prisma.MealPlanEntryInclude

type EntryRow = Prisma.MealPlanEntryGetPayload<{ include: typeof entryInclude }>

function toMealPlanEntry(row: EntryRow): MealPlanEntry {
  return {
    id: row.id,
    date: row.date,
    mealType: row.mealType,
    recipe: row.recipe
      ? {
          id: row.recipe.id,
          title: row.recipe.title,
          description: row.recipe.description,
          imageUrl: row.recipe.imageUrl,
          prepTimeMinutes: row.recipe.prepTimeMinutes,
          cookTimeMinutes: row.recipe.cookTimeMinutes,
          servings: row.recipe.servings,
          tags: row.recipe.tags.map(toTag),
          mealTypes: row.recipe.mealTypes,
        }
      : null,
    customLabel: row.customLabel,
    servings: row.servings,
    notes: row.notes,
    isGenerated: row.isGenerated,
    createdBy: toMemberSummary(row.createdBy),
    createdAt: row.createdAt,
  }
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function listMealPlanEntries(
  opts: { from?: Date; to?: Date } = {},
): Promise<MealPlanEntry[]> {
  const where: Prisma.MealPlanEntryWhereInput = {}
  if (opts.from || opts.to) {
    where.date = { ...(opts.from && { gte: opts.from }), ...(opts.to && { lte: opts.to }) }
  }
  const rows = await prisma.mealPlanEntry.findMany({
    where,
    include: entryInclude,
    orderBy: [{ date: 'asc' }, { mealType: 'asc' }],
  })
  return rows.map(toMealPlanEntry)
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function createMealPlanEntry(
  input: CreateMealPlanEntryInput,
  userId: string,
): Promise<MealPlanEntry> {
  if (input.recipeId) await assertRecipeExists(input.recipeId)
  const row = await prisma.mealPlanEntry.create({
    data: {
      date: input.date,
      mealType: input.mealType,
      recipeId: input.recipeId ?? null,
      customLabel: input.customLabel ?? null,
      servings: input.servings ?? null,
      notes: input.notes ?? null,
      createdById: userId,
    },
    include: entryInclude,
  })
  return toMealPlanEntry(row)
}

export async function updateMealPlanEntry(
  id: string,
  input: UpdateMealPlanEntryInput,
): Promise<MealPlanEntry> {
  const existing = await prisma.mealPlanEntry.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Meal plan entry not found')
  if (input.recipeId) await assertRecipeExists(input.recipeId)

  const row = await prisma.mealPlanEntry.update({
    where: { id },
    data: {
      ...(input.date !== undefined && { date: input.date }),
      ...(input.mealType !== undefined && { mealType: input.mealType }),
      ...(input.recipeId !== undefined && { recipeId: input.recipeId }),
      ...(input.customLabel !== undefined && { customLabel: input.customLabel }),
      ...(input.servings !== undefined && { servings: input.servings }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: entryInclude,
  })
  return toMealPlanEntry(row)
}

export async function deleteMealPlanEntry(id: string): Promise<void> {
  const existing = await prisma.mealPlanEntry.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Meal plan entry not found')
  await prisma.mealPlanEntry.delete({ where: { id } })
}

/** Wipe every entry in a date range — manual and generated alike ("start from scratch"). */
export async function clearMealPlan(range: ClearMealPlanInput): Promise<void> {
  await prisma.mealPlanEntry.deleteMany({
    where: { date: { gte: range.startDate, lte: range.endDate } },
  })
}

/**
 * Apply a generated plan (spec §8.6). The client rolls the picks (`generateMealPlan`)
 * and sends the accepted proposal; the server persists it. In one transaction it
 * clears its own prior **generated** entries in the range for the given meal types,
 * then writes the new picks as generated — but skips any cell already holding a
 * **manual** entry, so a hand-picked meal is never overwritten (only a re-generate
 * on a slot it doesn't occupy replaces the previous auto-pick). Returns the range's
 * entries so the grid refreshes.
 */
export async function applyGeneratedMealPlan(
  input: GenerateMealPlanInput,
  userId: string,
): Promise<MealPlanEntry[]> {
  const recipeIds = [...new Set(input.entries.map((e) => e.recipeId))]
  if (recipeIds.length > 0) {
    const found = await prisma.recipe.count({ where: { id: { in: recipeIds } } })
    if (found !== recipeIds.length) throw HttpError.badRequest('Unknown recipe')
  }

  await prisma.$transaction(async (tx) => {
    // Drop the previous generated picks in range for the meal types being rolled.
    await tx.mealPlanEntry.deleteMany({
      where: {
        date: { gte: input.startDate, lte: input.endDate },
        mealType: { in: input.mealTypes },
        isGenerated: true,
      },
    })

    // Cells still occupied are manual (isGenerated=false) — never write over them.
    const manual = await tx.mealPlanEntry.findMany({
      where: {
        date: { gte: input.startDate, lte: input.endDate },
        mealType: { in: input.mealTypes },
      },
      select: { date: true, mealType: true },
    })
    const locked = new Set(manual.map((m) => `${isoDate(m.date)}|${m.mealType}`))

    const rows = input.entries
      .filter((e) => !locked.has(`${isoDate(e.date)}|${e.mealType}`))
      .map((e) => ({
        date: e.date,
        mealType: e.mealType,
        recipeId: e.recipeId,
        isGenerated: true,
        createdById: userId,
      }))
    if (rows.length > 0) await tx.mealPlanEntry.createMany({ data: rows })
  })

  return listMealPlanEntries({ from: input.startDate, to: input.endDate })
}

// ── Generate shopping list (spec §8.6) ───────────────────────────────────────

/** Per-item running total while aggregating, in the item's base unit. */
interface Requirement {
  itemId: string
  name: string
  baseUnit: string | null
  requiredBase: number
}

/** A per-item shortfall to shop for, in the item's base unit. */
interface Shortfall {
  itemId: string
  name: string
  unit: string | null
  quantity: number
}

/**
 * Compute a date range's shopping shortfall — the read-only core shared by the
 * generate preview and commit (spec §8.6):
 *   1. sum each recipe ingredient (scaled by servings) per Item, in base units,
 *   2. subtract what the pantry already holds,
 *   3. return the positive remainder per item.
 * Writes nothing. Staples are excluded; ingredients whose unit can't convert to
 * the item's base unit are surfaced as warnings, never silently mis-summed.
 */
async function computeShortfall(input: {
  startDate: Date
  endDate: Date
}): Promise<{ shortfalls: Shortfall[]; warnings: string[] }> {
  const entries = await prisma.mealPlanEntry.findMany({
    where: {
      date: { gte: input.startDate, lte: input.endDate },
      recipeId: { not: null },
    },
    include: {
      recipe: {
        include: {
          ingredients: {
            include: { item: { select: { id: true, name: true, baseUnit: true, isStaple: true } } },
          },
        },
      },
    },
  })

  const required = new Map<string, Requirement>()
  const warnings = new Set<string>()

  for (const entry of entries) {
    if (!entry.recipe) continue
    const base = entry.recipe.servings || DEFAULT_SERVINGS
    const scale = (entry.servings ?? base) / base
    for (const ing of entry.recipe.ingredients) {
      if (ing.item.isStaple) continue // staples are never shopped (spec §8.5)
      if (ing.quantity == null) {
        warnings.add(ing.item.name) // unquantified, can't be summed onto a list
        continue
      }
      const amount = toBase(ing.quantity * scale, ing.unit, ing.item.baseUnit)
      if (amount === null) {
        warnings.add(ing.item.name)
        continue
      }
      const existing = required.get(ing.item.id)
      if (existing) existing.requiredBase += amount
      else
        required.set(ing.item.id, {
          itemId: ing.item.id,
          name: ing.item.name,
          // Unit-less counts fall back to "unit" so the list row reads sensibly.
          baseUnit: ing.item.baseUnit ?? (ing.unit ? null : 'unit'),
          requiredBase: amount,
        })
    }
  }

  if (required.size === 0) return { shortfalls: [], warnings: [...warnings] }

  // Subtract what's already in the pantry, converted to each item's base unit.
  const pantryRows = await prisma.pantryEntry.findMany({
    where: { itemId: { in: [...required.keys()] } },
    select: { itemId: true, quantity: true, unit: true, item: { select: { baseUnit: true } } },
  })
  const pantryByItem = new Map<string, number>()
  for (const row of pantryRows) {
    const amount = toBase(row.quantity, row.unit, row.item.baseUnit)
    if (amount === null) continue // unconvertible stock can't offset a requirement
    pantryByItem.set(row.itemId, (pantryByItem.get(row.itemId) ?? 0) + amount)
  }

  // Round to tame floating-point drift (e.g. 0.1 + 0.2) before comparing.
  const shortfalls = [...required.values()]
    .map((req) => ({
      itemId: req.itemId,
      name: req.name,
      unit: req.baseUnit,
      quantity: Math.round((req.requiredBase - (pantryByItem.get(req.itemId) ?? 0)) * 1000) / 1000,
    }))
    .filter((req) => req.quantity > 0)

  return { shortfalls, warnings: [...warnings] }
}

/**
 * Dry-run a generate: return the food shortfall for the two-panel modal to show
 * before anything is written (spec §8.6). Nothing is persisted.
 */
export async function previewShoppingList(
  input: PreviewShoppingListInput,
): Promise<ShoppingListPreview> {
  const { shortfalls, warnings } = await computeShortfall(input)
  return {
    lines: shortfalls.map((s) => ({
      itemId: s.itemId,
      name: s.name,
      quantity: s.quantity,
      unit: s.unit,
    })),
    warnings,
  }
}

/**
 * Commit a generate (spec §8.6): recompute the shortfall server-side (client
 * previews are never trusted), resolve a target list, and fold both the food
 * shortfall and any ticked consumables into it via the shared merge helper — so
 * summed lines carry the ×N badge. The target is `targetListId` when given, a
 * freshly named list when `listName` is given, else the most-recent active list
 * (or a new default-named one when none exists).
 */
export async function generateShoppingList(
  input: GenerateShoppingListInput,
  userId: string,
): Promise<GenerateShoppingListResult> {
  const { shortfalls, warnings } = await computeShortfall(input)
  const consumableIds = input.consumableItemIds ?? []

  if (shortfalls.length === 0 && consumableIds.length === 0) {
    return { list: null, warnings }
  }

  const listId = await prisma.$transaction(async (tx) => {
    const targetId = await resolveTargetList(tx, input, userId)

    for (const s of shortfalls) {
      await mergeOrCreateLine(tx, targetId, {
        itemId: s.itemId,
        quantity: s.quantity,
        unit: s.unit,
        source: 'MEAL_PLAN',
        userId,
      })
    }

    if (consumableIds.length > 0) {
      const items = await tx.item.findMany({
        where: { id: { in: consumableIds }, isConsumable: true },
      })
      for (const item of items) {
        await mergeOrCreateLine(tx, targetId, {
          itemId: item.id,
          quantity: item.defaultQuantity ?? null,
          unit: item.defaultUnit ?? null,
          source: 'CONSUMABLES',
          userId,
        })
      }
    }

    return targetId
  })

  return { list: await getShoppingList(listId), warnings }
}

/** Pick the list a generate commit folds into (spec §8.6). */
async function resolveTargetList(
  tx: Prisma.TransactionClient,
  input: GenerateShoppingListInput,
  userId: string,
): Promise<string> {
  if (input.targetListId) {
    const target = await tx.shoppingList.findUnique({ where: { id: input.targetListId } })
    if (!target) throw HttpError.badRequest('Target list not found')
    if (target.status !== 'ACTIVE') throw HttpError.badRequest('Target list is archived')
    return target.id
  }
  if (!input.listName) {
    const active = await tx.shoppingList.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
    })
    if (active) return active.id
  }
  const name =
    input.listName ?? `Meal plan shop (${isoDate(input.startDate)} – ${isoDate(input.endDate)})`
  const created = await tx.shoppingList.create({ data: { name, createdById: userId } })
  return created.id
}

// ── internals ──────────────────────────────────────────────────────────────

/**
 * Quantity in an item's base unit. Like {@link convertToBase}, but a unit-less
 * quantity is treated as a bare count ("2 onions") that always sums — even when
 * the item has no declared base unit — rather than being flagged as unconvertible.
 */
function toBase(quantity: number, unit: string | null, baseUnit: string | null): number | null {
  if (!unit) return quantity
  return convertToBase(quantity, unit, baseUnit)
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

async function assertRecipeExists(recipeId: string): Promise<void> {
  const found = await prisma.recipe.count({ where: { id: recipeId } })
  if (found === 0) throw HttpError.badRequest('Unknown recipe')
}
