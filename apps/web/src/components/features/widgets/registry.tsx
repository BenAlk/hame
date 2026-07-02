import type { ComponentType } from 'react'
import type { WidgetType } from '@hame/shared'
import {
  DASHBOARD_WIDGETS,
  HA_ACTIVATE_DOMAINS,
  HA_TOGGLE_DOMAINS,
  WIDGET_TYPES,
} from '@hame/shared'
import { useHaEntities } from '@/api/home-assistant'
import { useWifiConfig } from '@/api/wifi'
import { ActiveShoppingWidget } from './active-shopping-widget'
import { TodaysMealsWidget } from './todays-meals-widget'
import { TodaysChoresWidget } from './todays-chores-widget'
import { NextBinDayWidget } from './next-bin-day-widget'
import { PetRemindersWidget } from './pet-reminders-widget'
import { ExpiringSoonWidget } from './expiring-soon-widget'
import { LowStockWidget } from './low-stock-widget'
import { WeatherWidget } from './weather-widget'
import { SmartHomeWidget } from './smart-home-widget'
import { ClockGreetingWidget } from './clock-greeting-widget'
import { UpcomingEventsWidget } from './upcoming-events-widget'
import { WifiQrWidget } from './wifi-qr-widget'
import { ChoreStatsWidget } from './chore-stats-widget'

/** The component rendered for each placeable widget type (spec §10 Phase 7.1). */
export const WIDGET_COMPONENTS: Record<WidgetType, ComponentType> = {
  clockGreeting: ClockGreetingWidget,
  weather: WeatherWidget,
  todaysMeals: TodaysMealsWidget,
  activeShopping: ActiveShoppingWidget,
  todaysChores: TodaysChoresWidget,
  nextBinDay: NextBinDayWidget,
  upcomingEvents: UpcomingEventsWidget,
  petReminders: PetRemindersWidget,
  expiringSoon: ExpiringSoonWidget,
  lowStock: LowStockWidget,
  smartHome: SmartHomeWidget,
  wifiQr: WifiQrWidget,
  choreStats: ChoreStatsWidget,
}

const CONTROLLABLE = [...HA_TOGGLE_DOMAINS, ...HA_ACTIVATE_DOMAINS] as readonly string[]

/**
 * Which widgets can show something right now. Most widgets are always available;
 * the two HA-gated ones depend on the live registry (weather needs a `weather.*`
 * entity, smart-home something controllable), and the WiFi QR needs an enabled,
 * configured network. Drives both the add-tray (only offer available widgets)
 * and the placed-but-unavailable placeholder.
 */
export function useWidgetAvailability(): Record<WidgetType, boolean> {
  const { data: entities } = useHaEntities()
  const { data: wifi } = useWifiConfig()
  const list = entities ?? []
  const hasWeather = list.some((e) => e.domain === 'weather')
  const hasControllable = list.some((e) => CONTROLLABLE.includes(e.domain))
  // The WiFi QR is also gated on the viewer being local (spec §11).
  const hasWifi = Boolean(wifi?.configured && wifi.isActive && wifi.isLocalClient)

  const availability = {} as Record<WidgetType, boolean>
  for (const type of WIDGET_TYPES) {
    if (type === 'wifiQr') availability[type] = hasWifi
    else if (!DASHBOARD_WIDGETS[type].requiresHa) availability[type] = true
    else if (type === 'weather') availability[type] = hasWeather
    else if (type === 'smartHome') availability[type] = hasControllable
    else availability[type] = list.length > 0
  }
  return availability
}
