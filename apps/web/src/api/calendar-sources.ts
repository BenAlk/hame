import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CalendarSource,
  CalendarSyncResult,
  CreateCalendarSourceInput,
  UpdateCalendarSourceInput,
} from '@hame/shared'
import { apiFetch } from './client'
import { toast } from '@/stores/toast'

const SOURCES_KEY = ['calendar-sources'] as const

/** Sources feed the aggregated calendar, so refresh both on any change. */
function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: SOURCES_KEY })
  void qc.invalidateQueries({ queryKey: ['calendar'] })
}

export function useCalendarSources() {
  return useQuery<CalendarSource[]>({
    queryKey: SOURCES_KEY,
    queryFn: () => apiFetch<CalendarSource[]>('/api/calendar-sources'),
  })
}

export function useCreateCalendarSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCalendarSourceInput) =>
      apiFetch<CalendarSource>('/api/calendar-sources', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateCalendarSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCalendarSourceInput & { id: string }) =>
      apiFetch<CalendarSource>(`/api/calendar-sources/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidate(qc),
  })
}

export function useDeleteCalendarSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/calendar-sources/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate(qc)
      toast.success('Calendar removed.')
    },
  })
}

export function useSyncCalendarSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<CalendarSyncResult>(`/api/calendar-sources/${id}/sync`, { method: 'POST' }),
    onSuccess: (result) => {
      invalidate(qc)
      // Like bin sync, a failed fetch degrades to ok:false (cache kept) rather
      // than throwing — surface the outcome message either way.
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    },
  })
}
