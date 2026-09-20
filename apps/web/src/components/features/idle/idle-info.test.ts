import { describe, it, expect } from 'vitest'
import type { BinCollection, MealPlanEntry } from '@hame/shared'
import { mealTypeForHour, selectDueBins, selectSlotMeal } from './idle-info'

/** Minimal bin fixtures — the selector only reads isActive/nextCollection/name. */
function bin(over: Partial<BinCollection>): BinCollection {
  return {
    id: 'b',
    name: 'Bin',
    colour: '#000',
    isActive: true,
    nextCollection: null,
    ...over,
  } as BinCollection
}
function meal(over: Partial<MealPlanEntry>): MealPlanEntry {
  return {
    id: 'm',
    date: '2026-07-04',
    mealType: 'DINNER',
    recipe: null,
    customLabel: null,
    ...over,
  } as MealPlanEntry
}

const at = (h: number) => new Date(2026, 6, 4, h, 0, 0)

describe('mealTypeForHour', () => {
  it('maps the day into breakfast / lunch / dinner windows', () => {
    expect(mealTypeForHour(6)).toBe('BREAKFAST')
    expect(mealTypeForHour(9)).toBe('BREAKFAST')
    expect(mealTypeForHour(10)).toBe('LUNCH') // boundary falls to the later slot
    expect(mealTypeForHour(13)).toBe('LUNCH')
    expect(mealTypeForHour(14)).toBe('DINNER')
    expect(mealTypeForHour(19)).toBe('DINNER')
  })

  it('returns null outside meal windows', () => {
    expect(mealTypeForHour(5)).toBeNull()
    expect(mealTypeForHour(20)).toBeNull()
    expect(mealTypeForHour(2)).toBeNull()
  })
})

describe('selectDueBins', () => {
  const now = at(9)
  const today = new Date(2026, 6, 4)
  const tomorrow = new Date(2026, 6, 5)
  const later = new Date(2026, 6, 8)

  it('returns bins due today, labelled today', () => {
    const due = selectDueBins([bin({ name: 'Food', nextCollection: today })], now)
    expect(due).toEqual({ when: 'today', bins: [expect.objectContaining({ name: 'Food' })] })
  })

  it('returns bins due tomorrow when none are due today', () => {
    const due = selectDueBins([bin({ nextCollection: tomorrow })], now)
    expect(due?.when).toBe('tomorrow')
  })

  it('leads with today when both today and tomorrow have bins', () => {
    const due = selectDueBins(
      [bin({ name: 'A', nextCollection: today }), bin({ name: 'B', nextCollection: tomorrow })],
      now,
    )
    expect(due?.when).toBe('today')
    expect(due?.bins.map((b) => b.name)).toEqual(['A'])
  })

  it('groups every bin collected on the chosen day', () => {
    const due = selectDueBins(
      [bin({ name: 'A', nextCollection: today }), bin({ name: 'B', nextCollection: today })],
      now,
    )
    expect(due?.bins).toHaveLength(2)
  })

  it('ignores inactive bins and dates further out', () => {
    expect(
      selectDueBins(
        [
          bin({ nextCollection: today, isActive: false }),
          bin({ nextCollection: later }),
          bin({ nextCollection: null }),
        ],
        now,
      ),
    ).toBeNull()
  })

  describe('with a cutoff', () => {
    const cutoff = 360 // 06:00

    it('still shows today before the cutoff', () => {
      const due = selectDueBins([bin({ nextCollection: today })], at(5), cutoff)
      expect(due?.when).toBe('today')
    })

    it('treats the cutoff minute itself as past', () => {
      const due = selectDueBins([bin({ nextCollection: today })], at(6), cutoff)
      expect(due).toBeNull()
    })

    it('falls through to tomorrow once past the cutoff', () => {
      const due = selectDueBins(
        [bin({ name: 'A', nextCollection: today }), bin({ name: 'B', nextCollection: tomorrow })],
        at(7),
        cutoff,
      )
      expect(due?.when).toBe('tomorrow')
      expect(due?.bins.map((b) => b.name)).toEqual(['B'])
    })

    it('returns null past the cutoff when nothing is due tomorrow either', () => {
      expect(selectDueBins([bin({ nextCollection: today })], at(7), cutoff)).toBeNull()
    })

    it('shows today all day when no cutoff is set', () => {
      const due = selectDueBins([bin({ nextCollection: today })], at(23))
      expect(due?.when).toBe('today')
    })
  })
})

describe('selectSlotMeal', () => {
  it('picks the entry matching the current slot', () => {
    const entries = [meal({ mealType: 'BREAKFAST' }), meal({ mealType: 'DINNER' })]
    expect(selectSlotMeal(entries, at(15))?.mealType).toBe('DINNER')
  })

  it('returns null outside any meal window', () => {
    expect(selectSlotMeal([meal({ mealType: 'DINNER' })], at(22))).toBeNull()
  })

  it('returns null when nothing is planned for the current slot', () => {
    expect(selectSlotMeal([meal({ mealType: 'BREAKFAST' })], at(15))).toBeNull()
  })
})
