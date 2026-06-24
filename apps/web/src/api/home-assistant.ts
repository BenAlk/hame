import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  HaEntityState,
  HomeAssistantConfig,
  HomeAssistantTestResult,
  TestHomeAssistantInput,
  UpdateHomeAssistantConfigInput,
} from '@hame/shared'
import { apiFetch } from './client'

const HA_KEY = ['home-assistant-config'] as const
const HA_ENTITIES_KEY = ['home-assistant-entities'] as const
const API_BASE = import.meta.env.VITE_API_URL ?? ''

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

/** Current dashboard-relevant HA entity states (spec §10 Phase 6.2). */
export function useHaEntities(enabled = true) {
  return useQuery<HaEntityState[]>({
    queryKey: HA_ENTITIES_KEY,
    queryFn: () => apiFetch<HaEntityState[]>('/api/home-assistant/entities'),
    enabled,
  })
}

/**
 * Subscribe to live entity changes over SSE and patch the entities cache.
 * One-way push (EventSource); commands ride normal REST. No-op when disabled,
 * so households without Home Assistant never open the stream.
 */
export function useHaEntityStream(enabled = true) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    const source = new EventSource(`${API_BASE}/api/home-assistant/stream`, {
      withCredentials: true,
    })
    source.onmessage = (event) => {
      const entity = JSON.parse(event.data) as HaEntityState
      qc.setQueryData<HaEntityState[]>(HA_ENTITIES_KEY, (prev) => {
        const list = prev ?? []
        const idx = list.findIndex((e) => e.entityId === entity.entityId)
        if (idx === -1) return [...list, entity]
        const next = list.slice()
        next[idx] = entity
        return next
      })
    }
    // EventSource reconnects on its own; nothing to do on error.
    return () => source.close()
  }, [enabled, qc])
}
