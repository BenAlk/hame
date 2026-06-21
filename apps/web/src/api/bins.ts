import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BinCollection, CreateBinInput, UpdateBinInput } from '@hame/shared'
import { apiFetch } from './client'

const BINS_KEY = ['bins'] as const

/** Bins drive the calendar feed too, so refresh both on any change. */
function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: BINS_KEY })
  void qc.invalidateQueries({ queryKey: ['calendar'] })
}

export function useBins() {
  return useQuery<BinCollection[]>({
    queryKey: BINS_KEY,
    queryFn: () => apiFetch<BinCollection[]>('/api/bins'),
  })
}

export function useCreateBin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateBinInput) =>
      apiFetch<BinCollection>('/api/bins', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateBin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateBinInput & { id: string }) =>
      apiFetch<BinCollection>(`/api/bins/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => invalidate(qc),
  })
}

export function useDeleteBin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/bins/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(qc),
  })
}
