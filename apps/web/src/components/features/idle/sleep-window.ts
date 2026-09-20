import { useEffect, useState } from 'react'
import type { SleepModeSettings } from '@hame/shared'

/** How often the clock-boundary check re-runs. A 15s resolution is plenty for
 *  a schedule set to the minute. */
const CHECK_INTERVAL_MS = 15_000

/**
 * Whether `nowMinutes` (minutes since local midnight) falls inside the
 * schedule's `[startMinutes, endMinutes)` window (spec §8.14a). A normal
 * overnight window has `startMinutes > endMinutes` and wraps past midnight
 * (e.g. 22:00–07:00); `startMinutes === endMinutes` is treated as "never",
 * not "all day" — an admin would set `enabled: false` for that instead.
 */
export function isWithinSleepWindow(
  nowMinutes: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  if (startMinutes === endMinutes) return false
  if (startMinutes < endMinutes) return nowMinutes >= startMinutes && nowMinutes < endMinutes
  return nowMinutes >= startMinutes || nowMinutes < endMinutes
}

/** Minutes since local midnight, e.g. `06:00` → `360`. */
export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

/**
 * Ticks on a timer and reports whether the tablet's local clock is currently
 * inside the configured sleep window. `false` while settings haven't loaded
 * or sleep mode is off, so the caller never has to null-check.
 */
export function useSleepWindow(settings: SleepModeSettings | undefined): boolean {
  const [inWindow, setInWindow] = useState(false)

  useEffect(() => {
    if (!settings?.enabled) {
      setInWindow(false)
      return
    }
    const check = () => {
      setInWindow(
        isWithinSleepWindow(
          minutesSinceMidnight(new Date()),
          settings.startMinutes,
          settings.endMinutes,
        ),
      )
    }
    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [settings?.enabled, settings?.startMinutes, settings?.endMinutes])

  return inWindow
}
