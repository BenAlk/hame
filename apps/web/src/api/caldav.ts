import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CalDavConnection,
  CalDavCredential,
  CalDavCredentialCreated,
  CreateCalDavCredentialInput,
} from '@hame/shared'
import { apiFetch } from './client'

const CREDS_KEY = ['caldav-credentials'] as const

export function useCalDavCredentials() {
  return useQuery<CalDavCredential[]>({
    queryKey: CREDS_KEY,
    queryFn: () => apiFetch<CalDavCredential[]>('/api/caldav-credentials'),
  })
}

/** Where to point a CalDAV client — configured domain and/or the server's LAN address. */
export function useCalDavConnection() {
  return useQuery<CalDavConnection>({
    queryKey: ['caldav-connection'],
    queryFn: () => apiFetch<CalDavConnection>('/api/caldav-credentials/connection'),
  })
}

export function useCreateCalDavCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCalDavCredentialInput) =>
      apiFetch<CalDavCredentialCreated>('/api/caldav-credentials', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CREDS_KEY }),
  })
}

export function useDeleteCalDavCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/caldav-credentials/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CREDS_KEY }),
  })
}
