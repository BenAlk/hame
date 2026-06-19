import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreatePetInput, Pet, PetWithHistory, UpdatePetInput } from '@hame/shared'
import { apiFetch } from './client'

const PETS_KEY = ['pets'] as const

export function usePets() {
  return useQuery<Pet[]>({
    queryKey: PETS_KEY,
    queryFn: () => apiFetch<Pet[]>('/api/pets'),
  })
}

export function usePet(id: string | undefined) {
  return useQuery<PetWithHistory>({
    queryKey: [...PETS_KEY, id],
    queryFn: () => apiFetch<PetWithHistory>(`/api/pets/${id}`),
    enabled: Boolean(id),
  })
}

export function useCreatePet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreatePetInput) =>
      apiFetch<Pet>('/api/pets', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PETS_KEY }),
  })
}

export function useUpdatePet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdatePetInput & { id: string }) =>
      apiFetch<Pet>(`/api/pets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PETS_KEY }),
  })
}

export function useDeletePet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/pets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PETS_KEY }),
  })
}
