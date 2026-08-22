import { describe, it, expect, vi, beforeEach } from 'vitest'

const getForecast = vi.fn()

vi.mock('../integrations/home-assistant/client.js', () => ({
  haClient: { getForecast },
}))

const { getHomeAssistantForecast } = await import('../services/home-assistant-config.service.js')

beforeEach(() => {
  getForecast.mockReset()
})

describe('getHomeAssistantForecast', () => {
  it('maps the client result to forecast entries', async () => {
    getForecast.mockResolvedValue({
      'weather.home': {
        forecast: [{ datetime: '2026-08-22T18:00:00Z', condition: 'sunny', temperature: 20 }],
      },
    })
    const entries = await getHomeAssistantForecast('weather.home', 'hourly')
    expect(getForecast).toHaveBeenCalledWith('weather.home', 'hourly')
    expect(entries).toEqual([
      {
        datetime: new Date('2026-08-22T18:00:00Z'),
        condition: 'sunny',
        temperature: 20,
        precipitationProbability: null,
        humidity: null,
        windSpeed: null,
        isDaytime: null,
      },
    ])
  })

  it('degrades to a 502 rather than throwing the raw client error', async () => {
    getForecast.mockRejectedValue(new Error('Home Assistant is not connected'))
    await expect(getHomeAssistantForecast('weather.home', 'hourly')).rejects.toMatchObject({
      status: 502,
    })
  })
})
