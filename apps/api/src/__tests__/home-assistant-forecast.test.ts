import { describe, it, expect } from 'vitest'
import { mapHaForecast } from '../integrations/home-assistant/forecast.js'

describe('mapHaForecast', () => {
  it('projects an entity forecast out of the get_forecasts result envelope', () => {
    const entries = mapHaForecast(
      {
        'weather.home': {
          forecast: [
            {
              datetime: '2026-08-22T18:00:00+00:00',
              condition: 'partlycloudy',
              temperature: 19,
              precipitation_probability: 20,
              humidity: 65,
              wind_speed: 12,
              is_daytime: true,
            },
          ],
        },
      },
      'weather.home',
    )
    expect(entries).toEqual([
      {
        datetime: new Date('2026-08-22T18:00:00+00:00'),
        condition: 'partlycloudy',
        temperature: 19,
        precipitationProbability: 20,
        humidity: 65,
        windSpeed: 12,
        isDaytime: true,
      },
    ])
  })

  it('nulls out missing fields rather than dropping the entry', () => {
    const [entry] = mapHaForecast(
      { 'weather.home': { forecast: [{ datetime: '2026-08-22T18:00:00Z' }] } },
      'weather.home',
    )
    expect(entry).toEqual({
      datetime: new Date('2026-08-22T18:00:00Z'),
      condition: null,
      temperature: null,
      precipitationProbability: null,
      humidity: null,
      windSpeed: null,
      isDaytime: null,
    })
  })

  it('skips an entry with no readable datetime', () => {
    const entries = mapHaForecast(
      { 'weather.home': { forecast: [{ condition: 'sunny' }] } },
      'weather.home',
    )
    expect(entries).toEqual([])
  })

  it('returns empty when the entity id is missing from the envelope', () => {
    expect(mapHaForecast({ 'weather.other': { forecast: [] } }, 'weather.home')).toEqual([])
  })

  it('ignores malformed input', () => {
    expect(mapHaForecast(null, 'weather.home')).toEqual([])
    expect(mapHaForecast({ 'weather.home': {} }, 'weather.home')).toEqual([])
    expect(mapHaForecast({ 'weather.home': { forecast: 'nope' } }, 'weather.home')).toEqual([])
  })
})
