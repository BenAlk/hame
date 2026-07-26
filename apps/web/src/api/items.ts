import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateItemInput, Item, UpdateItemInput } from '@hame/shared'
import { apiFetch } from './client'

const ITEMS_KEY = ['items'] as const

/** All items, or only `quick-add`-tagged items when `quickAdd` is true. */
export function useItems(opts: { quickAdd?: boolean } = {}) {
  const path = opts.quickAdd ? '/api/items?quickAdd=true' : '/api/items'
  return useQuery<Item[]>({
    queryKey: [...ITEMS_KEY, { quickAdd: opts.quickAdd ?? false }],
    queryFn: () => apiFetch<Item[]>(path),
  })
}

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateItemInput) =>
      apiFetch<Item>('/api/items', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEMS_KEY }),
  })
}

/** Items are embedded in pantry entries and shopping lines, so those refresh too. */
export function useUpdateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateItemInput & { id: string }) =>
      apiFetch<Item>(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ITEMS_KEY })
      void qc.invalidateQueries({ queryKey: ['pantry'] })
      void qc.invalidateQueries({ queryKey: ['shopping-lists'] })
    },
  })
}

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEMS_KEY }),
  })
}
