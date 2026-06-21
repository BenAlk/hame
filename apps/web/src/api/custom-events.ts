import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateCustomEventInput, CustomEvent, UpdateCustomEventInput } from '@hame/shared'
import { apiFetch } from './client'

/** Custom events surface in the calendar feed, so refresh it on every change. */
function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['custom-events'] })
  void qc.invalidateQueries({ queryKey: ['calendar'] })
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
    onSuccess: () => invalidate(qc),
  })
}
