import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateStorageLocationInput,
  StorageLocation,
  UpdateStorageLocationInput,
} from '@hame/shared'
import { apiFetch } from './client'

const LOCATIONS_KEY = ['storage-locations'] as const

export function useStorageLocations() {
  return useQuery<StorageLocation[]>({
    queryKey: LOCATIONS_KEY,
    queryFn: () => apiFetch<StorageLocation[]>('/api/storage-locations'),
  })
}

export function useCreateStorageLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateStorageLocationInput) =>
      apiFetch<StorageLocation>('/api/storage-locations', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOCATIONS_KEY }),
  })
}

export function useUpdateStorageLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateStorageLocationInput & { id: string }) =>
      apiFetch<StorageLocation>(`/api/storage-locations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOCATIONS_KEY }),
  })
}

export function useDeleteStorageLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/storage-locations/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOCATIONS_KEY }),
  })
}
