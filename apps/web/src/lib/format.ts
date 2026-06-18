import { differenceInCalendarDays } from 'date-fns'

/**
 * Human relative day for an expiry/due date, never colour-only (design §10):
 * "Today", "Tomorrow", "in 3 days", "Yesterday", "2 days ago".
 */
export function relativeDay(date: Date | string, from = new Date()): string {
  const days = differenceInCalendarDays(new Date(date), from)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days > 1) return `in ${days} days`
  return `${Math.abs(days)} days ago`
}

/** True when a date is today or in the past — the "needs attention" threshold. */
export function isOverdueOrToday(date: Date | string, from = new Date()): boolean {
  return differenceInCalendarDays(new Date(date), from) <= 0
}

/** Compact quantity + unit label, e.g. "500 g", "2 packs", or "" when absent. */
export function quantityLabel(quantity?: number | null, unit?: string | null): string {
  if (quantity == null && !unit) return ''
  const qty = quantity == null ? '' : String(quantity)
  return [qty, unit ?? ''].filter(Boolean).join(' ')
}
