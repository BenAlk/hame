import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateCustomEventInput, CustomEvent, UpdateCustomEventInput } from '@hame/shared'
import { apiFetch } from './client'
import { toast } from '@/stores/toast'

/** Custom events surface in the calendar feed, so refresh it on every change. */
function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['custom-events'] })
  void qc.invalidateQueries({ queryKey: ['calendar'] })
}

/**
 * Full custom-event rows for a window — unlike the aggregated `/api/calendar`
 * feed, this carries every field a form needs to edit one (description,
 * recurrence), so the calendar page uses it to build an edit form's initial
 * values rather than the display-only feed row.
 */
export function useCustomEvents(from: string, to: string) {
  return useQuery<CustomEvent[]>({
    queryKey: ['custom-events', { from, to }],
    queryFn: () => apiFetch<CustomEvent[]>(`/api/custom-events?from=${from}&to=${to}`),
  })
}

export function useCreateCustomEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCustomEventInput) =>
      apiFetch<CustomEvent>('/api/custom-events', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateCustomEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCustomEventInput & { id: string }) =>
      apiFetch<CustomEvent>(`/api/custom-events/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidate(qc),
  })
}

export function useDeleteCustomEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/custom-events/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate(qc)
      toast.success('Event deleted.')
    },
  })
}
