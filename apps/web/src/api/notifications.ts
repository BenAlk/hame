import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  HaNotifyTarget,
  NotificationPreference,
  UpdateNotificationPreferenceInput,
} from '@hame/shared'
import { apiFetch } from './client'
import { toast } from '@/stores/toast'

const PREFS_KEY = ['notification-preferences'] as const

/** The signed-in user's notification preferences (spec §10 Phase 8). */
export function useNotificationPreferences() {
  return useQuery<NotificationPreference>({
    queryKey: PREFS_KEY,
    queryFn: () => apiFetch<NotificationPreference>('/api/notification-preferences'),
  })
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateNotificationPreferenceInput) =>
      apiFetch<NotificationPreference>('/api/notification-preferences', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (prefs) => {
      qc.setQueryData(PREFS_KEY, prefs)
      toast.success('Notification preferences saved.')
    },
  })
}

/**
 * Home Assistant notify targets for the phone picker (spec §10 Phase 8). Only
 * fetched when needed (a household without HA gets an empty list). A 502 (HA
 * configured but unreachable) is swallowed to an empty list so the picker just
 * shows "no phones found" rather than erroring the whole panel.
 */
export function useNotifyTargets(enabled = true) {
  return useQuery<HaNotifyTarget[]>({
    queryKey: ['notify-targets'],
    queryFn: () => apiFetch<HaNotifyTarget[]>('/api/home-assistant/notify-targets').catch(() => []),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}
