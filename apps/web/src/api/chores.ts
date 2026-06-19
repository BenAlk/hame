import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Chore,
  ChoreInstance,
  CompleteInstanceInput,
  CreateChoreInput,
  UpdateChoreInput,
} from '@hame/shared'
import { apiFetch } from './client'

const CHORES_KEY = ['chores'] as const
const INSTANCES_KEY = ['chore-instances'] as const

/** Completing/editing a chore ripples into instances, pets and the dashboard. */
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: CHORES_KEY })
  void qc.invalidateQueries({ queryKey: INSTANCES_KEY })
  void qc.invalidateQueries({ queryKey: ['pets'] })
}

export function useChores(active?: boolean) {
  return useQuery<Chore[]>({
    queryKey: [...CHORES_KEY, { active: active ?? 'all' }],
    queryFn: () =>
      apiFetch<Chore[]>(`/api/chores${active === undefined ? '' : `?active=${active}`}`),
  })
}

/** Open instances due today or overdue — powers the "Today's chores" widget. */
export function useTodaysChores() {
  return useQuery<ChoreInstance[]>({
    queryKey: [...INSTANCES_KEY, { due: 'today' }],
    queryFn: () => apiFetch<ChoreInstance[]>('/api/chore-instances?due=today'),
  })
}

export function useCreateChore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateChoreInput) =>
      apiFetch<Chore>('/api/chores', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useUpdateChore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateChoreInput & { id: string }) =>
      apiFetch<Chore>(`/api/chores/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useDeleteChore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/chores/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useCompleteInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: CompleteInstanceInput & { id: string }) =>
      apiFetch<Chore>(`/api/chore-instances/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useUncompleteInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Chore>(`/api/chore-instances/${id}/uncomplete`, { method: 'POST' }),
    onSuccess: () => invalidateAll(qc),
  })
}
