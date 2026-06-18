import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateTagInput, Tag, UpdateTagInput } from '@hame/shared'
import { apiFetch } from './client'

const TAGS_KEY = ['tags'] as const

export function useTags() {
  return useQuery<Tag[]>({ queryKey: TAGS_KEY, queryFn: () => apiFetch<Tag[]>('/api/tags') })
}

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateTagInput) =>
      apiFetch<Tag>('/api/tags', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TAGS_KEY }),
  })
}

export function useUpdateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateTagInput & { id: string }) =>
      apiFetch<Tag>(`/api/tags/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TAGS_KEY }),
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/tags/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TAGS_KEY }),
  })
}
