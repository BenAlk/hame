/**
 * Pure meal-plan generator (spec §8.6) — the random recipe-picking that fills a
 * week's empty/generatable slots, kept database-free and deterministic (an
 * injectable RNG) so it's unit-testable in isolation, the same pure/impure split
 * as the recurrence, reminder and chore-stats engines. The dialog runs it for
 * the live preview + reroll; the server only persists the chosen entries.
 *
 * Eligibility is per-recipe: a recipe can auto-fill a slot only when its
 * `mealTypes` includes that slot's meal type. Optional per-meal-type tag
 * **quotas** steer how many days should carry a given tag (e.g. a roast dinner
 * ×2). Anything left is filled from the whole eligible pool, cycling a shuffled
 * order so recipes only repeat once the pool is exhausted.
 */

import type { MealType } from './constants/index.js'

/** The minimal recipe shape the generator needs (a slice of RecipeSummary). */
export interface GeneratorRecipe {
  id: string
  mealTypes: MealType[]
  tags: { id: string }[]
}

/** A day + meal slot to fill, keyed by the entry's `yyyy-mm-dd` calendar day. */
export interface GeneratableSlot {
  date: string
  mealType: MealType
}

/** "Fill `count` of this meal type's slots with a recipe carrying `tagId`." */
export interface MealTypeQuota {
  tagId: string
  count: number
}

/** One picked meal — the shape the apply endpoint persists. */
export interface ProposedMeal {
  date: string
  mealType: MealType
  recipeId: string
}

/** Recipes eligible to fill a given meal slot. */
export function eligibleRecipes<T extends GeneratorRecipe>(recipes: T[], mealType: MealType): T[] {
  return recipes.filter((r) => r.mealTypes.includes(mealType))
}

/** In-place Fisher–Yates shuffle of a copy, using the injected RNG. */
function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * A lazy picker over a pool that cycles a shuffled order: it hands out each
 * recipe once before repeating any, reshuffling on each pass, so picks stay even
 * and only repeat when demand exceeds the pool. Returns null once the pool is
 * empty.
 */
function cyclingPicker(pool: GeneratorRecipe[], random: () => number): () => string | null {
  let order: GeneratorRecipe[] = []
  return () => {
    if (pool.length === 0) return null
    if (order.length === 0) order = shuffled(pool, random)
    return order.pop()!.id
  }
}

/**
 * Generate a proposal for the given generatable slots. Manual/locked slots are
 * the caller's concern — it passes only the slots that may be (re)filled.
 * Quotas are applied per meal type against that type's slots; a quota whose tag
 * matches no eligible recipe is skipped, and counts are capped at the slots
 * available. Slots with no eligible recipe at all yield no meal (left empty).
 */
export function generateMealPlan(params: {
  slots: GeneratableSlot[]
  recipes: GeneratorRecipe[]
  quotas?: Partial<Record<MealType, MealTypeQuota[]>>
  random?: () => number
}): ProposedMeal[] {
  const { slots, recipes, quotas = {}, random = Math.random } = params
  const proposals: ProposedMeal[] = []

  const byType = new Map<MealType, GeneratableSlot[]>()
  for (const slot of slots) {
    const list = byType.get(slot.mealType)
    if (list) list.push(slot)
    else byType.set(slot.mealType, [slot])
  }

  for (const [mealType, typeSlots] of byType) {
    const pool = eligibleRecipes(recipes, mealType)
    if (pool.length === 0) continue

    // Shuffle the day-slots so quota placement isn't biased toward early days.
    const openSlots = shuffled(typeSlots, random)
    const typeQuotas = quotas[mealType] ?? []

    // Quotas first: consume open slots with tag-matching recipes.
    const quotaTagIds = new Set(typeQuotas.map((q) => q.tagId))
    for (const quota of typeQuotas) {
      const matching = pool.filter((r) => r.tags.some((t) => t.id === quota.tagId))
      if (matching.length === 0) continue
      const pick = cyclingPicker(matching, random)
      const take = Math.min(quota.count, openSlots.length)
      for (let i = 0; i < take; i++) {
        const slot = openSlots.pop()!
        proposals.push({ date: slot.date, mealType, recipeId: pick()! })
      }
    }

    // Fill whatever remains — preferring recipes not already asked for by a
    // quota, so "roast ×2" means two roasts and the rest is variety; fall back
    // to the whole pool if excluding quota tags would leave nothing to pick.
    const nonQuota = pool.filter((r) => !r.tags.some((t) => quotaTagIds.has(t.id)))
    const fillPicker = cyclingPicker(nonQuota.length > 0 ? nonQuota : pool, random)
    for (const slot of openSlots) {
      proposals.push({ date: slot.date, mealType, recipeId: fillPicker()! })
    }
  }

  return proposals
}

/**
 * Pick one recipe for a single slot (a per-day reroll), excluding `excludeId`
 * where the pool allows so a reroll actually changes the meal. Returns null when
 * nothing is eligible.
 */
export function pickForSlot(params: {
  mealType: MealType
  recipes: GeneratorRecipe[]
  excludeId?: string | null
  random?: () => number
}): string | null {
  const { mealType, recipes, excludeId, random = Math.random } = params
  const pool = eligibleRecipes(recipes, mealType)
  if (pool.length === 0) return null
  const others = pool.filter((r) => r.id !== excludeId)
  const choices = others.length > 0 ? others : pool
  return choices[Math.floor(random() * choices.length)].id
}
