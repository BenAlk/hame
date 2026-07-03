import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Consumable, SetConsumableInput, UpdateConsumableInput } from '@hame/shared'
import { apiFetch } from './client'
import { toast } from '@/stores/toast'

const CONSUMABLES_KEY = ['consumables'] as const

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: CONSUMABLES_KEY })
}

/** The curated household re-order checklist (spec §8.3). */
export function useConsumables() {
  return useQuery<Consumable[]>({
    queryKey: CONSUMABLES_KEY,
    queryFn: () => apiFetch<Consumable[]>('/api/consumables'),
  })
}

export function useSetConsumable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SetConsumableInput) =>
      apiFetch<Consumable>('/api/consumables', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate(qc)
      // Adding by name may mint an Item, so refresh item-backed pickers too.
      void qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

export function useUpdateConsumable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, ...body }: UpdateConsumableInput & { itemId: string }) =>
      apiFetch<Consumable>(`/api/consumables/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidate(qc),
  })
}

export function useRemoveConsumable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<void>(`/api/consumables/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate(qc)
      toast.success('Removed from consumables.')
    },
  })
}
