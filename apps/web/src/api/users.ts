import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateUserInput,
  MemberSummary,
  PublicUser,
  UpdateProfileInput,
  UpdateUserInput,
} from '@hame/shared'
import { apiFetch } from './client'
import { toast } from '@/stores/toast'

const USERS_KEY = ['users'] as const

/** Non-sensitive household roster (any member) for assignment pickers. */
export function useMembers() {
  return useQuery<MemberSummary[]>({
    queryKey: ['members'],
    queryFn: () => apiFetch<MemberSummary[]>('/api/users/members'),
  })
}

/** Admin: list all household users. */
export function useUsers(enabled = true) {
  return useQuery<PublicUser[]>({
    queryKey: USERS_KEY,
    queryFn: () => apiFetch<PublicUser[]>('/api/users'),
    enabled,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateUserInput) =>
      apiFetch<PublicUser>('/api/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateUserInput & { id: string }) =>
      apiFetch<PublicUser>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: USERS_KEY })
      toast.success('User deleted.')
    },
  })
}

/** The current user editing their own profile. Refreshes `['me']` on success. */
export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateProfileInput) =>
      apiFetch<PublicUser>('/api/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  })
}
