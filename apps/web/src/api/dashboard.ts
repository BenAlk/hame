import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DashboardLayout, UpdateDashboardLayoutInput } from '@hame/shared'
import { apiFetch } from './client'

/**
 * Which dashboard to read/write: the signed-in user's (`me`), the shared
 * household/tablet's (`household`), or a specific member's (their user id) —
 * the last only ever *read*, so the wall tablet can page through everyone's
 * dashboards. Editing is limited to the editable owners below (spec §8.1).
 */
export type DashboardOwner = 'me' | 'household' | (string & {})

/** Only `me` and `household` are writable; a member id is a read-only view. */
export function isEditableOwner(owner: DashboardOwner): boolean {
  return owner === 'me' || owner === 'household'
}

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
