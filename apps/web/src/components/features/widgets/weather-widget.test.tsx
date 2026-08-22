import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { HaEntityState, HaForecastEntry } from '@hame/shared'
import { WeatherWidget } from './weather-widget'

const mocks = vi.hoisted(() => ({
  entities: vi.fn(),
  forecast: vi.fn(),
}))

vi.mock('@/api/home-assistant', () => ({
  useHaEntities: mocks.entities,
  useHaWeatherForecast: mocks.forecast,
}))

/** A weather entity as Home Assistant publishes one. */
function weatherEntity(over: Partial<HaEntityState> = {}): HaEntityState {
  return {
    entityId: 'weather.home',
    domain: 'weather',
    state: 'sunny',
    friendlyName: 'Home',
    attributes: { temperature: 21, temperature_unit: '°C', humidity: 60 },
    lastChanged: null,
    ...over,
  }
}

const hour = (over: Partial<HaForecastEntry> = {}): HaForecastEntry => ({
  datetime: new Date('2026-08-22T18:00:00Z'),
  condition: 'partlycloudy',
  temperature: 19,
  precipitationProbability: 20,
  humidity: 65,
  windSpeed: 12,
  isDaytime: true,
  ...over,
})

describe('WeatherWidget', () => {
  it('renders nothing when Home Assistant exposes no weather entity', () => {
    mocks.entities.mockReturnValue({ data: [] })
    const { container } = render(<WeatherWidget />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the current condition', () => {
    mocks.entities.mockReturnValue({ data: [weatherEntity()] })
    mocks.forecast.mockReturnValue({ data: undefined, isPending: true, isError: false })
    render(<WeatherWidget />)
    expect(screen.getByText('21°C')).toBeInTheDocument()
    expect(screen.getByText('Sunny')).toBeInTheDocument()
  })

  it('opens the hourly forecast modal on click, and closes it again', () => {
    mocks.entities.mockReturnValue({ data: [weatherEntity()] })
    mocks.forecast.mockReturnValue({
      data: [hour()],
      isPending: false,
      isError: false,
    })
    render(<WeatherWidget />)

    expect(screen.queryByText('Hourly forecast')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Sunny'))
    expect(screen.getByText('Hourly forecast')).toBeInTheDocument()
    expect(screen.getByText('19°')).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Close'))
    expect(screen.queryByText('Hourly forecast')).not.toBeInTheDocument()
  })

  it('reports when the forecast could not be fetched', () => {
    mocks.entities.mockReturnValue({ data: [weatherEntity()] })
    mocks.forecast.mockReturnValue({ data: undefined, isPending: false, isError: true })
    render(<WeatherWidget />)
    fireEvent.click(screen.getByText('Sunny'))
    expect(screen.getByText(/could not reach home assistant/i)).toBeInTheDocument()
  })
})
