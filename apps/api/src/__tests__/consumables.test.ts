import { describe, it, expect } from 'vitest'
import {
  consumableCadenceState,
  daysSinceLastBought,
  effectiveReorderInterval,
  isConsumableDue,
  suggestReorderInterval,
  type ConsumableSuggestion,
} from '@hame/shared'

const now = new Date('2026-07-03T12:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

/** Purchase timestamps a given set of whole-day gaps apart, oldest first. */
const purchasesWithGaps = (gaps: number[]) => {
  const days = [0]
  for (const g of gaps) days.push(days[days.length - 1] + g)
  const total = days[days.length - 1]
  // Anchor at noon UTC so local-day bucketing is stable across timezones.
  return days.map((d) => new Date(Date.UTC(2026, 0, 1, 12) + (d - total) * 86_400_000))
}

describe('daysSinceLastBought', () => {
  it('counts whole elapsed days', () => {
    expect(daysSinceLastBought(daysAgo(5), now)).toBe(5)
  })

  it('accepts an ISO string', () => {
    expect(daysSinceLastBought(daysAgo(2).toISOString(), now)).toBe(2)
  })

  it('is null when never bought', () => {
    expect(daysSinceLastBought(null, now)).toBeNull()
  })

  it('is null for an unparseable date', () => {
    expect(daysSinceLastBought('not-a-date', now)).toBeNull()
  })

  it('counts local calendar days, not 24-hour spans', () => {
    // 12 hours apart but straddling local midnight → one calendar day, whereas a
    // raw elapsed-ms floor would report zero. Built from local components so the
    // assertion holds in any timezone.
    const evening = new Date(2026, 6, 2, 20, 0, 0)
    const morning = new Date(2026, 6, 3, 8, 0, 0)
    expect(daysSinceLastBought(evening, morning)).toBe(1)
  })
})

describe('isConsumableDue', () => {
  it('is due once the interval has elapsed', () => {
    expect(isConsumableDue({ reorderIntervalDays: 21, lastBoughtAt: daysAgo(21) }, now)).toBe(true)
    expect(isConsumableDue({ reorderIntervalDays: 21, lastBoughtAt: daysAgo(30) }, now)).toBe(true)
  })

  it('is not due before the interval', () => {
    expect(isConsumableDue({ reorderIntervalDays: 21, lastBoughtAt: daysAgo(20) }, now)).toBe(false)
  })

  it('is never due without a cadence', () => {
    expect(isConsumableDue({ reorderIntervalDays: null, lastBoughtAt: daysAgo(999) }, now)).toBe(
      false,
    )
  })

  it('is never due when never bought (no baseline to nag from)', () => {
    expect(isConsumableDue({ reorderIntervalDays: 7, lastBoughtAt: null }, now)).toBe(false)
  })

  it('prefers the effective cadence over the raw manual field when supplied', () => {
    // Auto-applied cadence (5) fires even though the manual field is huge/absent.
    expect(
      isConsumableDue(
        { reorderIntervalDays: 999, effectiveIntervalDays: 5, lastBoughtAt: daysAgo(6) },
        now,
      ),
    ).toBe(true)
    // An explicit null effective cadence means "nothing in force" — not a fallback.
    expect(
      isConsumableDue(
        { reorderIntervalDays: 5, effectiveIntervalDays: null, lastBoughtAt: daysAgo(10) },
        now,
      ),
    ).toBe(false)
  })
})

const sugg = (days: number, confident: boolean, purchaseCount = 4): ConsumableSuggestion => ({
  days,
  purchaseCount,
  confident,
})

describe('suggestReorderInterval', () => {
  it('is null below the suggestion floor (< 3 purchases)', () => {
    expect(suggestReorderInterval(purchasesWithGaps([21]))).toBeNull() // 2 purchases
    expect(suggestReorderInterval([])).toBeNull()
  })

  it('suggests but is not confident at 3 purchases', () => {
    expect(suggestReorderInterval(purchasesWithGaps([21, 21]))).toEqual({
      days: 21,
      purchaseCount: 3,
      confident: false,
    })
  })

  it('is confident with 4+ regular purchases', () => {
    expect(suggestReorderInterval(purchasesWithGaps([21, 21, 21]))).toEqual({
      days: 21,
      purchaseCount: 4,
      confident: true,
    })
  })

  it('takes the median so one long gap does not skew it, and stays unconfident when erratic', () => {
    const result = suggestReorderInterval(purchasesWithGaps([14, 14, 90]))
    expect(result?.days).toBe(14) // median of [14, 14, 90]
    expect(result?.confident).toBe(false) // regularity guard trips on the outlier
  })

  it('windows to the most recent purchases', () => {
    const result = suggestReorderInterval(purchasesWithGaps([10, 10, 10, 10, 10, 10, 10, 10]))
    expect(result?.purchaseCount).toBe(6) // 9 purchases → last 6
    expect(result?.days).toBe(10)
  })

  it('dedupes purchases on the same calendar day', () => {
    const d1 = new Date(Date.UTC(2026, 0, 1, 12))
    const d1Again = new Date(Date.UTC(2026, 0, 1, 20)) // same calendar day, later
    const d2 = new Date(Date.UTC(2026, 0, 22, 12))
    const d3 = new Date(Date.UTC(2026, 1, 12, 12))
    // Four rows, three distinct days → counted as three purchases.
    expect(suggestReorderInterval([d1, d1Again, d2, d3])?.purchaseCount).toBe(3)
  })
})

describe('effectiveReorderInterval', () => {
  it('a manual cadence always wins', () => {
    expect(effectiveReorderInterval({ manual: 7, suggestion: sugg(14, true) }, true)).toBe(7)
  })

  it('auto-applies a confident estimate only when enabled and no manual value', () => {
    expect(effectiveReorderInterval({ manual: null, suggestion: sugg(14, true) }, true)).toBe(14)
    expect(effectiveReorderInterval({ manual: null, suggestion: sugg(14, true) }, false)).toBeNull()
    expect(effectiveReorderInterval({ manual: null, suggestion: sugg(14, false) }, true)).toBeNull()
    expect(effectiveReorderInterval({ manual: null, suggestion: null }, true)).toBeNull()
  })
})

describe('consumableCadenceState', () => {
  it('is manual whenever a value is typed (off, or a close estimate)', () => {
    expect(consumableCadenceState({ manual: 20, suggestion: sugg(21, true) }, true)).toBe('manual')
    expect(consumableCadenceState({ manual: 7, suggestion: sugg(21, true) }, false)).toBe('manual')
  })

  it('flags divergence when a manual value differs materially from a live estimate', () => {
    expect(consumableCadenceState({ manual: 7, suggestion: sugg(21, false) }, true)).toBe(
      'diverged',
    )
  })

  it('is auto vs suggested by confidence when no manual value', () => {
    expect(consumableCadenceState({ manual: null, suggestion: sugg(14, true) }, true)).toBe('auto')
    expect(consumableCadenceState({ manual: null, suggestion: sugg(14, false) }, true)).toBe(
      'suggested',
    )
  })

  it('is none when disabled or nothing to suggest', () => {
    expect(consumableCadenceState({ manual: null, suggestion: sugg(14, true) }, false)).toBe('none')
    expect(consumableCadenceState({ manual: null, suggestion: null }, true)).toBe('none')
  })
})
