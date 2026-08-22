/**
 * Home Assistant forecast reads (spec §10, weather forecast modal). Unlike
 * calendars, HA exposes forecasts only over the WebSocket (`weather/get_forecasts`,
 * relayed by {@link HomeAssistantClient.getForecast}) — there's no REST equivalent.
 * The command's result envelope is keyed by entity id:
 *
 *   { "weather.home": { "forecast": [ { datetime, condition, temperature, ... } ] } }
 *
 * {@link mapHaForecast} is the pure (raw WS result → rows) core, unit-tested
 * without a socket, the same split as `mapHaCalendarEvents`.
 */
import type { HaForecastEntry } from '@hame/shared'

interface RawForecastEntry {
  datetime?: unknown
  condition?: unknown
  temperature?: unknown
  precipitation_probability?: unknown
  humidity?: unknown
  wind_speed?: unknown
  is_daytime?: unknown
}

/** Project one entity's forecast out of a `weather/get_forecasts` result envelope. */
export function mapHaForecast(result: unknown, entityId: string): HaForecastEntry[] {
  if (!result || typeof result !== 'object') return []
  const entry = (result as Record<string, unknown>)[entityId]
  if (!entry || typeof entry !== 'object') return []
  const forecast = (entry as { forecast?: unknown }).forecast
  if (!Array.isArray(forecast)) return []

  const out: HaForecastEntry[] = []
  for (const raw of forecast as RawForecastEntry[]) {
    if (!raw || typeof raw !== 'object' || typeof raw.datetime !== 'string') continue
    const datetime = new Date(raw.datetime)
    if (Number.isNaN(datetime.getTime())) continue
    out.push({
      datetime,
      condition: str(raw.condition),
      temperature: num(raw.temperature),
      precipitationProbability: num(raw.precipitation_probability),
      humidity: num(raw.humidity),
      windSpeed: num(raw.wind_speed),
      isDaytime: bool(raw.is_daytime),
    })
  }
  return out
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}
