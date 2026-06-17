import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LoginInput, PublicUser, SetupInput } from '@hame/shared'
import { ApiError, apiFetch } from './client'

const ME_KEY = ['me'] as const

/**
 * The current user, or `null` when unauthenticated. A 401 is an expected
 * "not logged in" signal, not an error — so it resolves to null rather than
 * throwing (keeps the auth gate simple).
 */
export function useCurrentUser() {
  return useQuery<PublicUser | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await apiFetch<PublicUser>('/api/auth/me')
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    retry: false,
    staleTime: 30_000,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LoginInput) =>
      apiFetch<PublicUser>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<void>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null)
      void qc.invalidateQueries()
    },
  })
}

export function useSetup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SetupInput) =>
      apiFetch<PublicUser>('/api/setup', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup-status'] }),
  })
}
