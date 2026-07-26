import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateShopInput, Shop, UpdateShopInput } from '@hame/shared'
import { apiFetch } from './client'

const SHOPS_KEY = ['shops'] as const

export function useShops() {
  return useQuery<Shop[]>({
    queryKey: SHOPS_KEY,
    queryFn: () => apiFetch<Shop[]>('/api/shops'),
  })
}

export function useCreateShop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateShopInput) =>
      apiFetch<Shop>('/api/shops', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHOPS_KEY }),
  })
}

export function useUpdateShop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateShopInput & { id: string }) =>
      apiFetch<Shop>(`/api/shops/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHOPS_KEY }),
  })
}

/**
 * Deleting a shop clears it from its items (the FK is `SetNull`, spec §8.3), so
 * items and shopping lists are invalidated alongside the shop list itself.
 */
export function useDeleteShop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/shops/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SHOPS_KEY })
      void qc.invalidateQueries({ queryKey: ['items'] })
      void qc.invalidateQueries({ queryKey: ['shopping-lists'] })
      void qc.invalidateQueries({ queryKey: ['pantry'] })
    },
  })
}
