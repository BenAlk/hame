import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIdleSettings } from '@/api/idle'
import { useSleepModeSettings } from '@/api/sleep-mode'
import { useDashboardOwner } from '@/components/features/dashboard/dashboard-owner'
import { IdleScreensaver } from './idle-screensaver'
import { SleepScreen } from './sleep-screen'
import { useSleepWindow } from './sleep-window'

/** Input events that count as activity / wake the screensaver. */
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const

/**
 * Watch for inactivity and flip into idle mode after `activationMinutes` (spec
 * §8.14). Any input resets the timer and instantly wakes a running screensaver.
 * A no-op when an admin has turned idle mode off, so it never activates unbidden.
 */
function useIdleMode() {
  const { data: settings } = useIdleSettings()
  const enabled = settings?.enabled ?? false
  const activationMs = (settings?.activationMinutes ?? 5) * 60_000

  const [idle, setIdle] = useState(false)
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    if (!enabled) {
      setIdle(false)
      return
    }
    const markActive = () => {
      lastActivity.current = Date.now()
      setIdle(false) // a no-op re-render while already active (React bails on same value)
    }
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { passive: true })
    }
    const interval = setInterval(() => {
      if (Date.now() - lastActivity.current >= activationMs) setIdle(true)
    }, 1000)
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, markActive)
      clearInterval(interval)
    }
  }, [enabled, activationMs])

  return { idle: enabled && idle, settings }
}

/**
 * Mounts the idle screensaver after inactivity (spec §8.14); touch/any input
 * dismisses it via the activity listener. On waking it returns to the dashboard
 * rather than leaving the tablet on whatever page it was idle on — the wall
 * tablet's home base is always the dashboard.
 *
 * Inside an admin-configured overnight window (spec §8.14a) it shows a plain
 * black screen instead — the same idle/wake mechanics, just a different
 * component once idle, so sleep mode needs no timer or wake logic of its own.
 */
function IdleMode() {
  const { idle, settings } = useIdleMode()
  const { data: sleepSettings } = useSleepModeSettings()
  const inSleepWindow = useSleepWindow(sleepSettings)
  const navigate = useNavigate()

  // Navigate home on the idle → awake transition (not on every input while
  // already awake, which would fight normal navigation).
  const wasIdle = useRef(false)
  useEffect(() => {
    if (idle) {
      wasIdle.current = true
    } else if (wasIdle.current) {
      wasIdle.current = false
      navigate('/')
    }
  }, [idle, navigate])

  if (!idle || !settings) return null
  if (inSleepWindow) return <SleepScreen />
  return <IdleScreensaver settings={settings} />
}

/**
 * The screensaver is the **wall tablet's** behaviour (spec §8.14): mounted
 * app-wide (so the tablet screensaves whatever page it's left on), but only on
 * the device showing the shared **Household** dashboard — never on a phone in
 * normal use (its own "My dashboard"). The Household selection is exactly the
 * wall-tablet signal (spec §10 Phase 7.1: the tablet stays on Household across
 * reloads), so a phone screensaves only if its owner deliberately switches it to
 * Household.
 */
export function DashboardIdleMode() {
  const { owner } = useDashboardOwner()
  if (owner !== 'household') return null
  return <IdleMode />
}
