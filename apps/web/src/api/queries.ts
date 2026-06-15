import { useQuery } from '@tanstack/react-query'
import type { SetupStatus } from '@hame/shared'
import { apiFetch } from './client'

interface HealthResponse {
  status: string
  uptime: number
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthResponse>('/api/health'),
  })
}

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
    queryFn: () => apiFetch<SetupStatus>('/api/setup/status'),
  })
}
