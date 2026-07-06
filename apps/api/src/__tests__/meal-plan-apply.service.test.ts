import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GenerateMealPlanInput } from '@hame/shared'

const recipeCount = vi.fn()
const entryDeleteMany = vi.fn()
const entryFindMany = vi.fn()
const entryCreateMany = vi.fn()
const transaction = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    recipe: { count: recipeCount },
    mealPlanEntry: { findMany: entryFindMany, deleteMany: entryDeleteMany },
    $transaction: transaction,
  },
}))

const { applyGeneratedMealPlan, clearMealPlan } = await import('../services/meal-plan.service.js')

/** A `@db.Date`-style value: UTC midnight of the given day. */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

function input(over: Partial<GenerateMealPlanInput> = {}): GenerateMealPlanInput {
  return {
    startDate: d('2026-07-06'),
    endDate: d('2026-07-07'),
    mealTypes: ['DINNER'],
    entries: [
      { date: d('2026-07-06'), mealType: 'DINNER', recipeId: 'r1' },
      { date: d('2026-07-07'), mealType: 'DINNER', recipeId: 'r2' },
    ],
    ...over,
  }
}

beforeEach(() => {
  for (const fn of [recipeCount, entryDeleteMany, entryFindMany, entryCreateMany, transaction])
    fn.mockReset()
  transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      mealPlanEntry: {
        deleteMany: entryDeleteMany,
        findMany: entryFindMany,
        createMany: entryCreateMany,
      },
    }),
  )
  // The final listMealPlanEntries() call — return nothing so mapping is trivial.
  entryFindMany.mockResolvedValue([])
})

describe('applyGeneratedMealPlan', () => {
  it('clears prior generated entries in range and writes the picks as generated', async () => {
    recipeCount.mockResolvedValue(2)
    entryFindMany.mockResolvedValueOnce([]) // no manual entries occupy the slots
    entryFindMany.mockResolvedValueOnce([]) // final list

    await applyGeneratedMealPlan(input(), 'user1')

    expect(entryDeleteMany).toHaveBeenCalledWith({
      where: {
        date: { gte: d('2026-07-06'), lte: d('2026-07-07') },
        mealType: { in: ['DINNER'] },
        isGenerated: true,
      },
    })
    const created = entryCreateMany.mock.calls[0][0].data
    expect(created).toHaveLength(2)
    expect(created.every((r: { isGenerated: boolean }) => r.isGenerated === true)).toBe(true)
    expect(created.map((r: { recipeId: string }) => r.recipeId)).toEqual(['r1', 'r2'])
  })

  it('never overwrites a manual entry — skips its cell', async () => {
    recipeCount.mockResolvedValue(2)
    // A manual DINNER on the 6th survived the generated-delete; it locks that cell.
    entryFindMany.mockResolvedValueOnce([{ date: d('2026-07-06'), mealType: 'DINNER' }])
    entryFindMany.mockResolvedValueOnce([])

    await applyGeneratedMealPlan(input(), 'user1')

    const created = entryCreateMany.mock.calls[0][0].data
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ recipeId: 'r2', isGenerated: true })
  })

  it('does not write when every proposed cell is locked by a manual entry', async () => {
    recipeCount.mockResolvedValue(2)
    entryFindMany.mockResolvedValueOnce([
      { date: d('2026-07-06'), mealType: 'DINNER' },
      { date: d('2026-07-07'), mealType: 'DINNER' },
    ])
    entryFindMany.mockResolvedValueOnce([])

    await applyGeneratedMealPlan(input(), 'user1')
    expect(entryCreateMany).not.toHaveBeenCalled()
  })

  it('rejects an unknown recipe without touching the plan', async () => {
    recipeCount.mockResolvedValue(1) // only 1 of the 2 distinct recipes exists

    await expect(applyGeneratedMealPlan(input(), 'user1')).rejects.toMatchObject({ status: 400 })
    expect(transaction).not.toHaveBeenCalled()
  })
})

describe('clearMealPlan', () => {
  it('deletes every entry in the range (manual and generated alike)', async () => {
    await clearMealPlan({ startDate: d('2026-07-06'), endDate: d('2026-07-12') })
    expect(entryDeleteMany).toHaveBeenCalledWith({
      where: { date: { gte: d('2026-07-06'), lte: d('2026-07-12') } },
    })
  })
})
