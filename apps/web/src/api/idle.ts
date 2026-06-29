import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { IdleModeSettings, IdlePhotos, UpdateIdleModeSettingsInput } from '@hame/shared'
import { apiFetch } from './client'

const IDLE_SETTINGS_KEY = ['idle-settings'] as const
const IDLE_PHOTOS_KEY = ['idle-photos'] as const

/** Member-level: the household idle/screensaver settings (spec §10 Phase 7.3). */
export function useIdleSettings() {
  return useQuery<IdleModeSettings>({
    queryKey: IDLE_SETTINGS_KEY,
    queryFn: () => apiFetch<IdleModeSettings>('/api/idle/settings'),
  })
}

/** Admin-only: save the idle settings. */
export function useUpdateIdleSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateIdleModeSettingsInput) =>
      apiFetch<IdleModeSettings>('/api/idle/settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.setQueryData(IDLE_SETTINGS_KEY, data)
      void qc.invalidateQueries({ queryKey: IDLE_PHOTOS_KEY })
    },
  })
}

/**
 * The shuffled pool of asset ids the screensaver cycles (spec §8.14). Fetched
 * lazily — only enabled once idle mode actually activates, so a household that
 * never goes idle doesn't hit Immich. Empty when photos are off or Immich is
 * unconfigured, which makes the screensaver fall back to clock-only.
 */
export function useIdlePhotos(enabled: boolean) {
  return useQuery<IdlePhotos>({
    queryKey: IDLE_PHOTOS_KEY,
    queryFn: () => apiFetch<IdlePhotos>('/api/idle/photos'),
    enabled,
    // The album contents change rarely; don't refetch mid-screensaver.
    staleTime: 10 * 60 * 1000,
  })
}
