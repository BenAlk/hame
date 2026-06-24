import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  HomeAssistantConfig,
  HomeAssistantTestResult,
  TestHomeAssistantInput,
  UpdateHomeAssistantConfigInput,
} from '@hame/shared'
import { apiFetch } from './client'

const HA_KEY = ['home-assistant-config'] as const

/** Admin-only: the Home Assistant connection (spec §10 Phase 6). */
export function useHomeAssistantConfig(enabled = true) {
  return useQuery<HomeAssistantConfig>({
    queryKey: HA_KEY,
    queryFn: () => apiFetch<HomeAssistantConfig>('/api/home-assistant'),
    enabled,
  })
}

export function useUpdateHomeAssistantConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateHomeAssistantConfigInput) =>
      apiFetch<HomeAssistantConfig>('/api/home-assistant', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => qc.setQueryData(HA_KEY, data),
  })
}

/** Probe a (possibly unsaved) URL + token before saving it. */
export function useTestHomeAssistant() {
  return useMutation({
    mutationFn: (body: TestHomeAssistantInput) =>
      apiFetch<HomeAssistantTestResult>('/api/home-assistant/test', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  })
}
