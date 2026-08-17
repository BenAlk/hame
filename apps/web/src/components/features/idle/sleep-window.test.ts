import { describe, it, expect } from 'vitest'
import { isWithinSleepWindow } from './sleep-window'

describe('isWithinSleepWindow', () => {
  it('handles a same-day window (e.g. an afternoon nap slot)', () => {
    expect(isWithinSleepWindow(13 * 60, 12 * 60, 14 * 60)).toBe(true)
    expect(isWithinSleepWindow(11 * 60, 12 * 60, 14 * 60)).toBe(false)
    expect(isWithinSleepWindow(14 * 60, 12 * 60, 14 * 60)).toBe(false) // end is exclusive
  })

  it('wraps past midnight for a normal overnight window', () => {
    const start = 22 * 60 // 22:00
    const end = 7 * 60 // 07:00
    expect(isWithinSleepWindow(23 * 60, start, end)).toBe(true)
    expect(isWithinSleepWindow(6 * 60, start, end)).toBe(true)
    expect(isWithinSleepWindow(0, start, end)).toBe(true) // midnight itself
    expect(isWithinSleepWindow(12 * 60, start, end)).toBe(false) // midday, well outside
    expect(isWithinSleepWindow(7 * 60, start, end)).toBe(false) // end is exclusive
    expect(isWithinSleepWindow(21 * 60 + 59, start, end)).toBe(false)
  })

  it('treats an equal start and end as never, not all day', () => {
    expect(isWithinSleepWindow(0, 9 * 60, 9 * 60)).toBe(false)
    expect(isWithinSleepWindow(9 * 60, 9 * 60, 9 * 60)).toBe(false)
    expect(isWithinSleepWindow(23 * 60, 9 * 60, 9 * 60)).toBe(false)
  })
})
