import { describe, it, expect } from 'vitest'
import type { HaForecastEntry } from '@hame/shared'
import { groupForecastByDay } from './forecast-days'

const NOW = new Date('2026-08-22T16:00:00Z')

function hour(datetime: string): HaForecastEntry {
  return {
    datetime: new Date(datetime),
    condition: 'sunny',
    temperature: 15,
    precipitationProbability: null,
    humidity: null,
    windSpeed: null,
    isDaytime: true,
  }
}

describe('groupForecastByDay', () => {
  it('splits a run into as many days as it actually spans', () => {
    const days = groupForecastByDay(
      [
        hour('2026-08-22T17:00:00Z'),
        hour('2026-08-22T18:00:00Z'),
        hour('2026-08-23T00:00:00Z'),
        hour('2026-08-24T00:00:00Z'),
      ],
      NOW,
    )
    expect(days.map((d) => d.hours.length)).toEqual([2, 1, 1])
  })

  it('labels today and tomorrow, then falls back to the weekday name', () => {
    const days = groupForecastByDay(
      [hour('2026-08-22T17:00:00Z'), hour('2026-08-23T00:00:00Z'), hour('2026-08-24T00:00:00Z')],
      NOW,
    )
    expect(days.map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Monday'])
  })

  it('returns nothing for an empty run', () => {
    expect(groupForecastByDay([], NOW)).toEqual([])
  })

  it('keeps a single day as one tab', () => {
    const days = groupForecastByDay(
      [hour('2026-08-22T17:00:00Z'), hour('2026-08-22T20:00:00Z')],
      NOW,
    )
    expect(days).toHaveLength(1)
    expect(days[0].label).toBe('Today')
  })
})
