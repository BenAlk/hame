import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  HaBinSensor,
  HaCalendar,
  HaEntityState,
  HaServiceCallInput,
  HaServiceCallResult,
  HomeAssistantConfig,
  HomeAssistantTestResult,
  SmartHomeEntityIdsInput,
  SmartHomeSettings,
  TestHomeAssistantInput,
  UpdateHomeAssistantConfigInput,
  UpdateSmartHomeSettingsInput,
} from '@hame/shared'
import { apiFetch } from './client'
import type { DashboardOwner } from './dashboard'

const HA_KEY = ['home-assistant-config'] as const
const HA_ENTITIES_KEY = ['home-assistant-entities'] as const
const HA_CALENDARS_KEY = ['home-assistant-calendars'] as const
const HA_BIN_SENSORS_KEY = ['home-assistant-bin-sensors'] as const
const HA_CONTROLS_KEY = ['home-assistant-controls'] as const
const HA_SUGGESTIONS_KEY = ['home-assistant-suggestions'] as const
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
 * Relay a device control to Home Assistant (spec §10 Phase 6.3). The entity's
 * state truth comes back over the SSE stream, so there's no optimistic write —
 * the toggle reflects HA a beat later. Returns the structured `{ ok, message }`.
 */
export function useHaControl() {
  return useMutation<HaServiceCallResult, Error, HaServiceCallInput>({
    mutationFn: (body) =>
      apiFetch<HaServiceCallResult>('/api/home-assistant/service', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  })
}

/** HA calendar entities for the calendar-source picker (spec §10 Phase 6.3). */
export function useHaCalendars(enabled = true) {
  return useQuery<HaCalendar[]>({
    queryKey: HA_CALENDARS_KEY,
    queryFn: () => apiFetch<HaCalendar[]>('/api/home-assistant/calendars'),
    enabled,
  })
}

/** HA bin-collection sensors for the bin-source picker (spec §10 Phase 6). */
export function useHaBinSensors(enabled = true) {
  return useQuery<HaBinSensor[]>({
    queryKey: HA_BIN_SENSORS_KEY,
    queryFn: () => apiFetch<HaBinSensor[]>('/api/home-assistant/bin-sensors'),
    enabled,
  })
}

/** The owner's curated smart-home control list (spec §10 Phase 6.3, 7.1b). */
export function useSmartHomeControls(owner: DashboardOwner) {
  return useQuery<SmartHomeSettings>({
    queryKey: [...HA_CONTROLS_KEY, owner],
    queryFn: () => apiFetch<SmartHomeSettings>(`/api/home-assistant/controls?owner=${owner}`),
  })
}

/** Save the owner's curated control list (the Smart-home page's Save button). */
export function useUpdateSmartHomeControls(owner: DashboardOwner) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateSmartHomeSettingsInput) =>
      apiFetch<SmartHomeSettings>(`/api/home-assistant/controls?owner=${owner}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.setQueryData([...HA_CONTROLS_KEY, owner], data)
      void qc.invalidateQueries({ queryKey: [...HA_SUGGESTIONS_KEY, owner] })
    },
  })
}

/** New controllable devices Hame found but this owner hasn't decided on yet. */
export function useSmartHomeSuggestions(owner: DashboardOwner, enabled = true) {
  return useQuery<HaEntityState[]>({
    queryKey: [...HA_SUGGESTIONS_KEY, owner],
    queryFn: () => apiFetch<HaEntityState[]>(`/api/home-assistant/suggestions?owner=${owner}`),
    enabled,
  })
}

/** Add suggested devices to the owner's widget (the dashboard prompt's "Add"). */
export function useAddSmartHomeControls(owner: DashboardOwner) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SmartHomeEntityIdsInput) =>
      apiFetch<SmartHomeSettings>(`/api/home-assistant/controls/add?owner=${owner}`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.setQueryData([...HA_CONTROLS_KEY, owner], data)
      void qc.invalidateQueries({ queryKey: [...HA_SUGGESTIONS_KEY, owner] })
    },
  })
}

/** Dismiss suggested devices without adding them (the prompt's "Dismiss"). */
export function useDismissSmartHomeSuggestions(owner: DashboardOwner) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SmartHomeEntityIdsInput) =>
      apiFetch<void>(`/api/home-assistant/controls/dismiss?owner=${owner}`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...HA_SUGGESTIONS_KEY, owner] }),
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
        if (idx === -1) {
          // A brand-new entity just appeared in HA — re-check for a suggestion to
          // prompt (spec §10 Phase 6.3), so a freshly-added bulb surfaces at once.
          void qc.invalidateQueries({ queryKey: HA_SUGGESTIONS_KEY })
          return [...list, entity]
        }
        const next = list.slice()
        next[idx] = entity
        return next
      })
    }
    // A device was deleted in HA — drop it from the cache so the widget and
    // picker stop showing it, and refresh the curated list (the server prunes
    // the deleted id from it). See spec §10 Phase 6.3.
    source.addEventListener('remove', (event) => {
      const entityId = JSON.parse((event as MessageEvent<string>).data) as string
      qc.setQueryData<HaEntityState[]>(HA_ENTITIES_KEY, (prev) =>
        (prev ?? []).filter((e) => e.entityId !== entityId),
      )
      void qc.invalidateQueries({ queryKey: HA_CONTROLS_KEY })
    })
    // EventSource reconnects on its own; nothing to do on error.
    return () => source.close()
  }, [enabled, qc])
}
