import { useDashboardOwner } from '@/components/features/dashboard/dashboard-owner'
import { useWakeLock } from './wake-lock'

/**
 * Keeps the wall tablet's screen powered on (spec §8.14a) — gated the same
 * way as `DashboardIdleMode`: only on the device showing the shared
 * **Household** dashboard, never on a phone in normal use. Unlike sleep mode
 * this isn't schedule-bound — it holds whenever the tablet is on that view,
 * replacing FreeKiosk's screen-stay-on duty generally, not just overnight.
 */
export function DashboardWakeLock() {
  const { owner } = useDashboardOwner()
  useWakeLock(owner === 'household')
  return null
}
