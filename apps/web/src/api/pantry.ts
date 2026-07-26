import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BulkCreatePantryEntriesInput,
  CreatePantryEntryInput,
  LowStockItem,
  PantryEntry,
  UpdatePantryEntryInput,
} from '@hame/shared'
import { apiFetch } from './client'

const PANTRY_KEY = ['pantry'] as const

/** Invalidate everything pantry-derived (entries + the two widget queries). */
function invalidatePantry(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: PANTRY_KEY })
}

export function usePantry() {
  return useQuery<PantryEntry[]>({
    queryKey: [...PANTRY_KEY, 'entries'],
    queryFn: () => apiFetch<PantryEntry[]>('/api/pantry'),
  })
}

export function useExpiringSoon() {
  return useQuery<PantryEntry[]>({
    queryKey: [...PANTRY_KEY, 'expiring-soon'],
    queryFn: () => apiFetch<PantryEntry[]>('/api/pantry/expiring-soon'),
  })
}

export function useLowStock() {
  return useQuery<LowStockItem[]>({
    queryKey: [...PANTRY_KEY, 'low-stock'],
    queryFn: () => apiFetch<LowStockItem[]>('/api/pantry/low-stock'),
  })
}

export function useCreatePantryEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreatePantryEntryInput) =>
      apiFetch<PantryEntry>('/api/pantry', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidatePantry(qc),
  })
}

/** Commit a whole scanned batch in one transaction (spec §10 Phase 14). */
export function useCreatePantryEntries() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: BulkCreatePantryEntriesInput) =>
      apiFetch<PantryEntry[]>('/api/pantry/bulk', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidatePantry(qc),
  })
}

export function useUpdatePantryEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdatePantryEntryInput & { id: string }) =>
      apiFetch<PantryEntry>(`/api/pantry/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => invalidatePantry(qc),
  })
}

export function useDeletePantryEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/pantry/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidatePantry(qc),
  })
}
