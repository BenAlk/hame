import { describe, it, expect } from 'vitest'
import { computeStreak, isOnTime } from '@hame/shared'

/** Local-time date at the given calendar day (+ optional hour). */
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h)
/** A `@db.Date`-style value: UTC midnight of the given calendar day. */
const dueDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

describe('computeStreak', () => {
  const today = day(2026, 7, 2)

  it('is 0 with no completions', () => {
    expect(computeStreak([], today)).toBe(0)
  })

  it('counts a completion today', () => {
    expect(computeStreak([day(2026, 7, 2, 9)], today)).toBe(1)
  })

  it('counts consecutive days ending today', () => {
    expect(computeStreak([day(2026, 7, 2), day(2026, 7, 1), day(2026, 6, 30)], today)).toBe(3)
  })

  it('breaks the run at a missed day', () => {
    // Today + two days ago, but nothing yesterday → only today counts.
    expect(computeStreak([day(2026, 7, 2), day(2026, 6, 30)], today)).toBe(1)
  })

  it('stays alive from yesterday (grace before midnight resets it)', () => {
    expect(computeStreak([day(2026, 7, 1), day(2026, 6, 30)], today)).toBe(2)
  })

  it('is 0 when the latest completion is older than yesterday', () => {
    expect(computeStreak([day(2026, 6, 30), day(2026, 6, 29)], today)).toBe(0)
  })

  it('dedupes multiple completions on the same day and ignores order', () => {
    const completions = [day(2026, 7, 1, 8), day(2026, 7, 2, 20), day(2026, 7, 2, 9)]
    expect(computeStreak(completions, today)).toBe(2)
  })
})

describe('isOnTime', () => {
  it('is on time when completed before the due day', () => {
    expect(isOnTime(day(2026, 7, 1, 15), dueDate(2026, 7, 3))).toBe(true)
  })

  it('is on time when completed on the due day', () => {
    expect(isOnTime(day(2026, 7, 3, 23), dueDate(2026, 7, 3))).toBe(true)
  })

  it('is late when completed after the due day', () => {
    expect(isOnTime(day(2026, 7, 4, 1), dueDate(2026, 7, 3))).toBe(false)
  })
})
