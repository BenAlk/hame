import { useQuery } from '@tanstack/react-query'
import type { ChoreStats, StatsWindow } from '@hame/shared'
import { apiFetch } from './client'

/**
 * Household chore "pulling your weight" stats over the last `days` (spec §10
 * Phase 8). Read-only and derived live from completion history, so it's a plain
 * query keyed by the window; a short stale time keeps the dashboard widget cheap.
 */
export function useChoreStats(days: StatsWindow = 30) {
  return useQuery<ChoreStats>({
    queryKey: ['chore-stats', days],
    queryFn: () => apiFetch<ChoreStats>(`/api/stats/chores?days=${days}`),
    staleTime: 60 * 1000,
  })
}
