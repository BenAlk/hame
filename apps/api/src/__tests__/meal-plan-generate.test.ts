import { describe, it, expect } from 'vitest'
import type { GeneratorRecipe, GeneratableSlot, MealType } from '@hame/shared'
import { eligibleRecipes, generateMealPlan, pickForSlot } from '@hame/shared'

function recipe(id: string, mealTypes: MealType[], tagIds: string[] = []): GeneratorRecipe {
  return { id, mealTypes, tags: tagIds.map((t) => ({ id: t })) }
}

const dinnerSlots = (dates: string[]): GeneratableSlot[] =>
  dates.map((date) => ({ date, mealType: 'DINNER' as const }))

const WEEK = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10']

describe('eligibleRecipes', () => {
  it('keeps only recipes whose mealTypes include the slot', () => {
    const recipes = [recipe('a', ['DINNER']), recipe('b', ['BREAKFAST']), recipe('c', ['DINNER'])]
    expect(eligibleRecipes(recipes, 'DINNER').map((r) => r.id)).toEqual(['a', 'c'])
  })
})

describe('generateMealPlan', () => {
  it('fills every slot when the pool is non-empty', () => {
    const recipes = [recipe('a', ['DINNER']), recipe('b', ['DINNER']), recipe('c', ['DINNER'])]
    const out = generateMealPlan({ slots: dinnerSlots(WEEK), recipes, random: () => 0 })
    expect(out).toHaveLength(WEEK.length)
    expect(new Set(out.map((m) => m.date))).toEqual(new Set(WEEK))
    for (const m of out) expect(['a', 'b', 'c']).toContain(m.recipeId)
  })

  it('only picks recipes eligible for that meal type', () => {
    const recipes = [recipe('breakfast1', ['BREAKFAST']), recipe('dinner1', ['DINNER'])]
    const slots: GeneratableSlot[] = [
      { date: '2026-07-06', mealType: 'BREAKFAST' },
      { date: '2026-07-06', mealType: 'DINNER' },
    ]
    const out = generateMealPlan({ slots, recipes, random: () => 0 })
    const byType = new Map(out.map((m) => [m.mealType, m.recipeId]))
    expect(byType.get('BREAKFAST')).toBe('breakfast1')
    expect(byType.get('DINNER')).toBe('dinner1')
  })

  it('leaves a meal type with no eligible recipe empty', () => {
    const recipes = [recipe('dinner1', ['DINNER'])]
    const slots: GeneratableSlot[] = [
      { date: '2026-07-06', mealType: 'BREAKFAST' },
      { date: '2026-07-06', mealType: 'DINNER' },
    ]
    const out = generateMealPlan({ slots, recipes, random: () => 0 })
    expect(out).toHaveLength(1)
    expect(out[0].mealType).toBe('DINNER')
  })

  it('does not repeat a recipe until the pool is exhausted', () => {
    const recipes = [recipe('a', ['DINNER']), recipe('b', ['DINNER']), recipe('c', ['DINNER'])]
    // 3 slots, 3 recipes → every recipe used exactly once.
    const out = generateMealPlan({ slots: dinnerSlots(WEEK.slice(0, 3)), recipes, random: () => 0 })
    expect(new Set(out.map((m) => m.recipeId))).toEqual(new Set(['a', 'b', 'c']))
  })

  it('repeats only once demand exceeds the pool', () => {
    const recipes = [recipe('a', ['DINNER']), recipe('b', ['DINNER'])]
    // 4 slots, 2 recipes → each appears exactly twice.
    const out = generateMealPlan({ slots: dinnerSlots(WEEK.slice(0, 4)), recipes, random: () => 0 })
    const counts = out.reduce<Record<string, number>>((acc, m) => {
      acc[m.recipeId] = (acc[m.recipeId] ?? 0) + 1
      return acc
    }, {})
    expect(counts).toEqual({ a: 2, b: 2 })
  })

  it('honours a tag quota — N slots get a tag-matching recipe', () => {
    const recipes = [
      recipe('roast1', ['DINNER'], ['roast']),
      recipe('roast2', ['DINNER'], ['roast']),
      recipe('pasta', ['DINNER'], ['pasta']),
      recipe('curry', ['DINNER'], ['curry']),
    ]
    const out = generateMealPlan({
      slots: dinnerSlots(WEEK),
      recipes,
      quotas: { DINNER: [{ tagId: 'roast', count: 2 }] },
      random: () => 0,
    })
    // Exactly 2 roasts: the fill prefers non-quota recipes (pasta/curry).
    const roastCount = out.filter((m) => m.recipeId.startsWith('roast')).length
    expect(roastCount).toBe(2)
    expect(out).toHaveLength(WEEK.length)
  })

  it('caps a quota at the number of available slots', () => {
    const recipes = [
      recipe('roast1', ['DINNER'], ['roast']),
      recipe('roast2', ['DINNER'], ['roast']),
    ]
    const out = generateMealPlan({
      slots: dinnerSlots(WEEK.slice(0, 2)),
      recipes,
      quotas: { DINNER: [{ tagId: 'roast', count: 5 }] },
      random: () => 0,
    })
    expect(out).toHaveLength(2)
  })

  it('skips a quota whose tag matches no eligible recipe', () => {
    const recipes = [recipe('pasta', ['DINNER'], ['pasta'])]
    const out = generateMealPlan({
      slots: dinnerSlots(WEEK.slice(0, 2)),
      recipes,
      quotas: { DINNER: [{ tagId: 'roast', count: 2 }] },
      random: () => 0,
    })
    // Still fills from the general pool, just not with a roast.
    expect(out).toHaveLength(2)
    expect(out.every((m) => m.recipeId === 'pasta')).toBe(true)
  })
})

describe('pickForSlot', () => {
  it('returns null when nothing is eligible', () => {
    expect(pickForSlot({ mealType: 'DINNER', recipes: [recipe('b', ['BREAKFAST'])] })).toBeNull()
  })

  it('excludes the current recipe when the pool allows', () => {
    const recipes = [recipe('a', ['DINNER']), recipe('b', ['DINNER'])]
    // random 0 → first of the filtered (exclude a) list, which is b.
    const picked = pickForSlot({ mealType: 'DINNER', recipes, excludeId: 'a', random: () => 0 })
    expect(picked).toBe('b')
  })

  it('falls back to the excluded recipe when it is the only option', () => {
    const recipes = [recipe('a', ['DINNER'])]
    const picked = pickForSlot({ mealType: 'DINNER', recipes, excludeId: 'a', random: () => 0 })
    expect(picked).toBe('a')
  })
})
