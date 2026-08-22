import { format, isSameDay } from 'date-fns'
import type { HaForecastEntry } from '@hame/shared'

/** One day's worth of hourly forecast entries, for the modal's day tabs. */
export interface ForecastDay {
  key: string
  label: string
  hours: HaForecastEntry[]
}

/**
 * Split a flat hourly forecast into day-tabs (spec §10, weather forecast modal).
 * Home Assistant/met.no's hourly run spans however many days it spans — never a
 * fixed count — so this reads the run itself rather than assuming 2, 3 or 4.
 * Grouped and labelled in local time, matching the `HH:mm` already shown per row.
 */
export function groupForecastByDay(hours: HaForecastEntry[], now: Date): ForecastDay[] {
  const days: ForecastDay[] = []
  for (const hour of hours) {
    const date = new Date(hour.datetime)
    const last = days[days.length - 1]
    if (last && isSameDay(new Date(last.hours[0].datetime), date)) {
      last.hours.push(hour)
      continue
    }
    days.push({
      key: format(date, 'yyyy-MM-dd'),
      label: forecastDayLabel(date, now),
      hours: [hour],
    })
  }
  return days
}

/** "Today" / "Tomorrow" for the first two days, then the weekday name. */
function forecastDayLabel(date: Date, now: Date): string {
  if (isSameDay(date, now)) return 'Today'
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (isSameDay(date, tomorrow)) return 'Tomorrow'
  return format(date, 'EEEE')
}
