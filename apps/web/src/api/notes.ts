import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateNoteInput, Note, UpdateNoteInput } from '@hame/shared'
import { apiFetch } from './client'
import { toast } from '@/stores/toast'

const NOTES_KEY = ['notes'] as const

/** The viewer-scoped QuickNotes feed (household notes + the caller's own direct
 *  notes). Polled so a note another member posts appears on the wall before long. */
export function useNotes() {
  return useQuery<Note[]>({
    queryKey: NOTES_KEY,
    queryFn: () => apiFetch<Note[]>('/api/notes'),
    refetchInterval: 60_000,
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: NOTES_KEY })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateNoteInput) =>
      apiFetch<Note>('/api/notes', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateNoteInput & { id: string }) =>
      apiFetch<Note>(`/api/notes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => invalidate(qc),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate(qc)
      toast.success('Note removed.')
    },
  })
}

export function useDismissNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/notes/${id}/dismiss`, { method: 'POST' }),
    onSuccess: () => invalidate(qc),
  })
}
