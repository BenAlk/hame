import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { HouseholdSettings, UpdateHouseholdSettingsInput } from '@hame/shared'
import { apiFetch } from './client'

const SETTINGS_KEY = ['household-settings'] as const

export function useHouseholdSettings() {
  return useQuery<HouseholdSettings>({
    queryKey: SETTINGS_KEY,
    queryFn: () => apiFetch<HouseholdSettings>('/api/household-settings'),
  })
}

export function useUpdateHouseholdSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateHouseholdSettingsInput) =>
      apiFetch<HouseholdSettings>('/api/household-settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => qc.setQueryData(SETTINGS_KEY, data),
  })
}
