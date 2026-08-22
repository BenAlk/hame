import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Modal } from '@/components/ui/modal'
import { useHaWeatherForecast } from '@/api/home-assistant'
import { groupForecastByDay } from '@/lib/forecast-days'
import { cn } from '@/lib/utils'
import { weatherCondition } from './weather-conditions'

interface WeatherForecastModalProps {
  entityId: string
  onClose: () => void
}

/** Hourly forecast for the dashboard weather widget (spec §10, weather forecast
 *  modal). A live WS round-trip (no REST equivalent), so it's only fetched once
 *  the modal is open rather than kept warm alongside the entity stream. The run
 *  is split into day tabs — however many days it actually spans, not a fixed
 *  count, since that varies by provider and time of day. */
export function WeatherForecastModal({ entityId, onClose }: WeatherForecastModalProps) {
  const { data: hours, isPending, isError } = useHaWeatherForecast(entityId, true)
  const days = useMemo(() => groupForecastByDay(hours ?? [], new Date()), [hours])
  const [dayIndex, setDayIndex] = useState(0)
  const day = days[dayIndex]

  return (
    <Modal open onClose={onClose} title="Hourly forecast" className="max-w-md">
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">
          Could not reach Home Assistant for the forecast.
        </p>
      ) : day ? (
        <div className="flex flex-col gap-3">
          {days.length > 1 && (
            <div className="flex gap-1 border-b border-line">
              {days.map((d, i) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDayIndex(i)}
                  aria-current={i === dayIndex}
                  className={cn(
                    'rounded-t-control px-3 py-1.5 text-sm',
                    i === dayIndex
                      ? 'border-b-2 border-accent text-ink'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
          <ul className="flex flex-col divide-y divide-line">
            {day.hours.map((hour) => {
              const { label, Icon } = weatherCondition(hour.condition ?? '')
              return (
                <li
                  key={hour.datetime.toString()}
                  className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="w-12 shrink-0 text-sm text-muted-foreground">
                    {format(new Date(hour.datetime), 'HH:mm')}
                  </span>
                  <Icon className="size-5 shrink-0 text-ink" strokeWidth={1.5} aria-hidden />
                  <span className="flex-1 truncate text-sm text-ink">{label}</span>
                  {hour.precipitationProbability !== null && hour.precipitationProbability > 0 && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {Math.round(hour.precipitationProbability)}%
                    </span>
                  )}
                  <span className="w-10 shrink-0 text-right font-serif text-lg text-ink">
                    {hour.temperature !== null ? `${Math.round(hour.temperature)}°` : '—'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No forecast available.</p>
      )}
    </Modal>
  )
}
