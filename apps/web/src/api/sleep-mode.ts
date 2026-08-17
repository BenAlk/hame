import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SleepModeSettings, UpdateSleepModeSettingsInput } from '@hame/shared'
import { apiFetch } from './client'

const SLEEP_MODE_SETTINGS_KEY = ['sleep-mode-settings'] as const

/** Member-level: the household sleep-mode schedule (spec §10 Phase 26). */
export function useSleepModeSettings() {
  return useQuery<SleepModeSettings>({
    queryKey: SLEEP_MODE_SETTINGS_KEY,
    queryFn: () => apiFetch<SleepModeSettings>('/api/sleep-mode/settings'),
  })
}

/** Admin-only: save the sleep-mode schedule. */
export function useUpdateSleepModeSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateSleepModeSettingsInput) =>
      apiFetch<SleepModeSettings>('/api/sleep-mode/settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.setQueryData(SLEEP_MODE_SETTINGS_KEY, data)
    },
  })
}
