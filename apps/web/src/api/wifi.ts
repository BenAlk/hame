import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UpdateWifiConfigInput, WifiConfig } from '@hame/shared'
import { apiFetch } from './client'

const WIFI_KEY = ['wifi-config'] as const

/** Member-level: the household WiFi config feeding the QR widget (spec §10 Phase 7.2). */
export function useWifiConfig() {
  return useQuery<WifiConfig>({
    queryKey: WIFI_KEY,
    queryFn: () => apiFetch<WifiConfig>('/api/wifi'),
  })
}

/** Admin-only: save the WiFi network details. */
export function useUpdateWifiConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateWifiConfigInput) =>
      apiFetch<WifiConfig>('/api/wifi', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (data) => qc.setQueryData(WIFI_KEY, data),
  })
}
