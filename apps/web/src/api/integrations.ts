import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateIntegrationInput,
  Integration,
  IntegrationProviderInfo,
  IntegrationStatus,
  IntegrationTestResult,
  TestIntegrationInput,
  UpdateIntegrationInput,
} from '@hame/shared'
import { apiFetch } from './client'

const INTEGRATIONS_KEY = ['integrations'] as const
const PROVIDERS_KEY = ['integration-providers'] as const
const STATUS_KEY = ['integration-status'] as const

/** Member-level: active STATUS snapshots for the dashboard widget (no secrets/config). */
export function useIntegrationStatus(enabled = true) {
  return useQuery<IntegrationStatus[]>({
    queryKey: STATUS_KEY,
    queryFn: () => apiFetch<IntegrationStatus[]>('/api/integrations/status'),
    enabled,
    // The poller refreshes snapshots server-side; pick them up without a manual reload.
    refetchInterval: 60_000,
  })
}

/** Admin-only: the catalogue of registered providers for the "add" picker. */
export function useIntegrationProviders(enabled = true) {
  return useQuery<IntegrationProviderInfo[]>({
    queryKey: PROVIDERS_KEY,
    queryFn: () => apiFetch<IntegrationProviderInfo[]>('/api/integrations/providers'),
    enabled,
  })
}

/** Admin-only: the configured integrations (spec §10 Phase 10). */
export function useIntegrations(enabled = true) {
  return useQuery<Integration[]>({
    queryKey: INTEGRATIONS_KEY,
    queryFn: () => apiFetch<Integration[]>('/api/integrations'),
    enabled,
  })
}

/** Invalidate the list plus the calendar (CALENDAR integrations feed it). */
function useRefresh() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: INTEGRATIONS_KEY })
    void qc.invalidateQueries({ queryKey: STATUS_KEY })
    void qc.invalidateQueries({ queryKey: ['calendar'] })
  }
}

export function useCreateIntegration() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (body: CreateIntegrationInput) =>
      apiFetch<Integration>('/api/integrations', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: refresh,
  })
}

export function useUpdateIntegration() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateIntegrationInput }) =>
      apiFetch<Integration>(`/api/integrations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  })
}

export function useDeleteIntegration() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/integrations/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  })
}

/** Refresh one integration's cached data now (the per-card "Sync now"). */
export function useSyncIntegration() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Integration>(`/api/integrations/${id}/sync`, { method: 'POST' }),
    onSuccess: refresh,
  })
}

/** Probe an unsaved provider + config + secret before committing it. */
export function useTestIntegration() {
  return useMutation({
    mutationFn: (body: TestIntegrationInput) =>
      apiFetch<IntegrationTestResult>('/api/integrations/test', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  })
}
