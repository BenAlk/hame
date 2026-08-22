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

/** Friendly label + line icon for each HA weather condition (raw state otherwise).
 *  Shared by the dashboard widget and its hourly-forecast modal. */
export const WEATHER_CONDITIONS: Record<string, { label: string; Icon: LucideIcon }> = {
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

/** Label + icon for a condition, falling back to the raw state when unmapped. */
export function weatherCondition(condition: string): { label: string; Icon: LucideIcon } {
  return WEATHER_CONDITIONS[condition] ?? { label: condition, Icon: Cloud }
}
