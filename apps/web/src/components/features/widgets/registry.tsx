import type { ComponentType } from 'react'
import type { WidgetType } from '@hame/shared'
import {
  DASHBOARD_WIDGETS,
  HA_ACTIVATE_DOMAINS,
  HA_TOGGLE_DOMAINS,
  WIDGET_TYPES,
} from '@hame/shared'
import { useHaEntities } from '@/api/home-assistant'
import { ActiveShoppingWidget } from './active-shopping-widget'
import { TodaysMealsWidget } from './todays-meals-widget'
import { TodaysChoresWidget } from './todays-chores-widget'
import { NextBinDayWidget } from './next-bin-day-widget'
import { PetRemindersWidget } from './pet-reminders-widget'
import { ExpiringSoonWidget } from './expiring-soon-widget'
import { LowStockWidget } from './low-stock-widget'
import { WeatherWidget } from './weather-widget'
import { SmartHomeWidget } from './smart-home-widget'

/** The component rendered for each placeable widget type (spec §10 Phase 7.1). */
export const WIDGET_COMPONENTS: Record<WidgetType, ComponentType> = {
  weather: WeatherWidget,
  todaysMeals: TodaysMealsWidget,
  activeShopping: ActiveShoppingWidget,
  todaysChores: TodaysChoresWidget,
  nextBinDay: NextBinDayWidget,
  petReminders: PetRemindersWidget,
  expiringSoon: ExpiringSoonWidget,
  lowStock: LowStockWidget,
  smartHome: SmartHomeWidget,
}

const CONTROLLABLE = [...HA_TOGGLE_DOMAINS, ...HA_ACTIVATE_DOMAINS] as readonly string[]

/**
 * Which widgets can show something right now. Non-HA widgets are always
 * available; the two HA-gated ones depend on the live registry — weather needs a
 * `weather.*` entity, smart-home something controllable. Drives both the add-tray
 * (only offer available widgets) and the placed-but-unavailable placeholder.
 */
export function useWidgetAvailability(): Record<WidgetType, boolean> {
  const { data: entities } = useHaEntities()
  const list = entities ?? []
  const hasWeather = list.some((e) => e.domain === 'weather')
  const hasControllable = list.some((e) => CONTROLLABLE.includes(e.domain))

  const availability = {} as Record<WidgetType, boolean>
  for (const type of WIDGET_TYPES) {
    if (!DASHBOARD_WIDGETS[type].requiresHa) availability[type] = true
    else if (type === 'weather') availability[type] = hasWeather
    else if (type === 'smartHome') availability[type] = hasControllable
    else availability[type] = list.length > 0
  }
  return availability
}
