import { useMemo, useState } from 'react'
import type { HaEntityState } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { useHaEntities } from '@/api/home-assistant'
import { weatherCondition } from './weather-conditions'
import { WeatherForecastModal } from './weather-forecast-modal'

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Weather from Home Assistant (spec §8.12, §10 Phase 6.2). Renders nothing
 *  unless HA exposes a weather entity, so non-HA households don't see it. */
export function WeatherWidget() {
  const { data: entities } = useHaEntities()
  const [forecastOpen, setForecastOpen] = useState(false)
  const weather = useMemo<HaEntityState | undefined>(
    () => entities?.find((e) => e.domain === 'weather'),
    [entities],
  )

  if (!weather) return null // the page owns the SSE stream (HomePage); this just reads it

  const temperature = num(weather.attributes.temperature)
  const unit = str(weather.attributes.temperature_unit) ?? '°'
  const humidity = num(weather.attributes.humidity)
  const { label, Icon } = weatherCondition(weather.state)

  return (
    <WidgetCard title="Weather">
      <button
        type="button"
        onClick={() => setForecastOpen(true)}
        className="flex w-full flex-col gap-1 rounded-control text-left"
      >
        <div className="flex items-center gap-3">
          <Icon
            className="size-10 shrink-0 translate-y-[-8px] text-ink"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="font-serif text-4xl leading-none text-ink">
            {temperature !== null ? `${Math.round(temperature)}${unit}` : '—'}
          </p>
        </div>
        <p className="text-sm text-ink">{label}</p>
        <p className="text-sm text-muted-foreground">
          {weather.friendlyName}
          {humidity !== null ? ` · ${Math.round(humidity)}% humidity` : ''}
        </p>
      </button>
      {forecastOpen && (
        <WeatherForecastModal entityId={weather.entityId} onClose={() => setForecastOpen(false)} />
      )}
    </WidgetCard>
  )
}
