import type { Chore, Weekday } from '@hame/shared'

const WEEKDAY_LABEL: Record<Weekday, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
}

const ORDINAL_SUFFIX = (n: number): string => {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return 'th'
  switch (n % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

/** Short human description of a chore's schedule, e.g. "Every 30 days", "Sat". */
export function recurrenceSummary(chore: Chore): string {
  switch (chore.recurrenceType) {
    case 'INTERVAL':
      return chore.intervalDays === 1 ? 'Every day' : `Every ${chore.intervalDays} days`
    case 'WEEKLY':
      return chore.weekdays.map((w) => WEEKDAY_LABEL[w]).join(', ') || 'Weekly'
    case 'DATE_OF_MONTH':
      return chore.dayOfMonth
        ? `${chore.dayOfMonth}${ORDINAL_SUFFIX(chore.dayOfMonth)} of month`
        : 'Monthly'
    case 'ONE_OFF':
      return 'One-off'
  }
}
