import { describe, it, expect } from 'vitest'
import { daysSinceLastBought, isConsumableDue } from '@hame/shared'

const now = new Date('2026-07-03T12:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

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
})
