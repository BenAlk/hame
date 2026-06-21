import { useQuery } from '@tanstack/react-query'
import type { CalendarEvent } from '@hame/shared'
import { apiFetch } from './client'

/** Aggregated calendar feed for a date window (spec §8.10) — both bounds inclusive ISO dates. */
export function useCalendar(start: string, end: string) {
  return useQuery<CalendarEvent[]>({
    queryKey: ['calendar', { start, end }],
    queryFn: () => apiFetch<CalendarEvent[]>(`/api/calendar?start=${start}&end=${end}`),
  })
}
