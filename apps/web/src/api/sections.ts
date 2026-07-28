import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateSectionInput,
  ReorderSectionsInput,
  Section,
  UpdateSectionInput,
} from '@hame/shared'
import { apiFetch } from './client'

const SECTIONS_KEY = ['sections'] as const

/**
 * Sections are embedded in items, which are embedded in shopping lines and pantry
 * entries — so renaming, recolouring or reordering one has to refresh those too,
 * or a list keeps grouping by stale names and positions.
 */
function invalidateSections(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: SECTIONS_KEY })
  void qc.invalidateQueries({ queryKey: ['items'] })
  void qc.invalidateQueries({ queryKey: ['pantry'] })
  void qc.invalidateQueries({ queryKey: ['shopping-lists'] })
}

export function useSections() {
  return useQuery<Section[]>({
    queryKey: SECTIONS_KEY,
    queryFn: () => apiFetch<Section[]>('/api/sections'),
  })
}

export function useCreateSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateSectionInput) =>
      apiFetch<Section>('/api/sections', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidateSections(qc),
  })
}

export function useUpdateSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateSectionInput & { id: string }) =>
      apiFetch<Section>(`/api/sections/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => invalidateSections(qc),
  })
}

export function useReorderSections() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ReorderSectionsInput) =>
      apiFetch<Section[]>('/api/sections/reorder', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateSections(qc),
  })
}

export function useDeleteSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/sections/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateSections(qc),
  })
}
