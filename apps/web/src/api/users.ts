import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateUserInput,
  MemberSummary,
  PublicUser,
  TabletAccount,
  TabletCredentials,
  UpdateProfileInput,
  UpdateTabletInput,
  UpdateUserInput,
} from '@hame/shared'
import { apiFetch } from './client'
import { toast } from '@/stores/toast'

const USERS_KEY = ['users'] as const
const TABLET_KEY = ['tablet-account'] as const

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

// ── Wall-tablet account (spec §8.1) ──────────────────────────────────────────

/** Admin: the shared wall-tablet account (or null if not yet provisioned). */
export function useTabletAccount(enabled = true) {
  return useQuery<TabletAccount>({
    queryKey: TABLET_KEY,
    queryFn: () => apiFetch<TabletAccount>('/api/users/tablet'),
    enabled,
  })
}

/** Admin: provision the tablet account, returning its login once. */
export function useCreateTablet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<TabletCredentials>('/api/users/tablet', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TABLET_KEY }),
  })
}

/**
 * Admin: name the wall tablet, or clear its name with an empty string. The name
 * is what the dashboard greeting uses, so `['me']` is refreshed too — the tablet
 * itself is usually the signed-in account watching that greeting.
 */
export function useUpdateTablet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateTabletInput) =>
      apiFetch<TabletAccount>('/api/users/tablet', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TABLET_KEY })
      void qc.invalidateQueries({ queryKey: ['me'] })
      toast.success('Wall-tablet name saved.')
    },
  })
}

/** Admin: re-issue the tablet account's password, returned once. */
export function useResetTablet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<TabletCredentials>('/api/users/tablet/reset', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TABLET_KEY }),
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
