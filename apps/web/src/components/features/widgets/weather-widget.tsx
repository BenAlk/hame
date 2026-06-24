import { useMemo } from 'react'
import {
  Cloud,
  CloudAlert,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import type { HaEntityState } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { useHaEntities, useHaEntityStream } from '@/api/home-assistant'

/** Friendly label + line icon for each HA weather condition (raw state otherwise). */
const CONDITIONS: Record<string, { label: string; Icon: LucideIcon }> = {
  'clear-night': { label: 'Clear', Icon: Moon },
  cloudy: { label: 'Cloudy', Icon: Cloud },
  fog: { label: 'Fog', Icon: CloudFog },
  hail: { label: 'Hail', Icon: CloudHail },
  lightning: { label: 'Lightning', Icon: CloudLightning },
  'lightning-rainy': { label: 'Thunderstorms', Icon: CloudLightning },
  partlycloudy: { label: 'Partly cloudy', Icon: CloudSun },
  pouring: { label: 'Pouring', Icon: CloudRainWind },
  rainy: { label: 'Rain', Icon: CloudRain },
  snowy: { label: 'Snow', Icon: CloudSnow },
  'snowy-rainy': { label: 'Sleet', Icon: CloudDrizzle },
  sunny: { label: 'Sunny', Icon: Sun },
  windy: { label: 'Windy', Icon: Wind },
  'windy-variant': { label: 'Windy', Icon: Wind },
  exceptional: { label: 'Exceptional', Icon: CloudAlert },
}

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
  const weather = useMemo<HaEntityState | undefined>(
    () => entities?.find((e) => e.domain === 'weather'),
    [entities],
  )
  // Only open the live stream once we know HA actually has a weather entity.
  useHaEntityStream(Boolean(weather))

  if (!weather) return null

  const temperature = num(weather.attributes.temperature)
  const unit = str(weather.attributes.temperature_unit) ?? '°'
  const humidity = num(weather.attributes.humidity)
  const { label, Icon } = CONDITIONS[weather.state] ?? { label: weather.state, Icon: Cloud }

  return (
    <WidgetCard title="Weather">
      <div className="flex flex-col gap-1">
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
      </div>
    </WidgetCard>
  )
}
