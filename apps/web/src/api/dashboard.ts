import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DashboardLayout, UpdateDashboardLayoutInput } from '@hame/shared'
import { apiFetch } from './client'

/** Which dashboard to read/write: the signed-in user's, or the shared tablet's. */
export type DashboardOwner = 'me' | 'household'

const dashboardKey = (owner: DashboardOwner) => ['dashboard', owner] as const

/** The owner's saved layout, or the shared default if they haven't customised. */
export function useDashboardLayout(owner: DashboardOwner) {
  return useQuery<DashboardLayout>({
    queryKey: dashboardKey(owner),
    queryFn: () => apiFetch<DashboardLayout>(`/api/dashboard?owner=${owner}`),
  })
}

/** Save the owner's layout wholesale (the edit-mode Save). */
export function useSaveDashboardLayout(owner: DashboardOwner) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateDashboardLayoutInput) =>
      apiFetch<DashboardLayout>(`/api/dashboard?owner=${owner}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => qc.setQueryData(dashboardKey(owner), data),
  })
}
