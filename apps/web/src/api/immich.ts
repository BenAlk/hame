import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ImmichAlbum,
  ImmichConfig,
  ImmichTestResult,
  TestImmichInput,
  UpdateImmichConfigInput,
} from '@hame/shared'
import { apiFetch } from './client'

const IMMICH_KEY = ['immich-config'] as const
const IMMICH_ALBUMS_KEY = ['immich-albums'] as const

/** Admin-only: the Immich connection feeding the idle screensaver (spec §10 Phase 7.3). */
export function useImmichConfig(enabled = true) {
  return useQuery<ImmichConfig>({
    queryKey: IMMICH_KEY,
    queryFn: () => apiFetch<ImmichConfig>('/api/immich'),
    enabled,
  })
}

export function useUpdateImmichConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateImmichConfigInput) =>
      apiFetch<ImmichConfig>('/api/immich', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.setQueryData(IMMICH_KEY, data)
      void qc.invalidateQueries({ queryKey: IMMICH_ALBUMS_KEY })
    },
  })
}

/** Probe a (possibly unsaved) URL + key before saving it. */
export function useTestImmich() {
  return useMutation({
    mutationFn: (body: TestImmichInput) =>
      apiFetch<ImmichTestResult>('/api/immich/test', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  })
}

/** The configured server's albums, for the Settings picker. Empty when unset. */
export function useImmichAlbums(enabled = true) {
  return useQuery<ImmichAlbum[]>({
    queryKey: IMMICH_ALBUMS_KEY,
    queryFn: () => apiFetch<ImmichAlbum[]>('/api/immich/albums'),
    enabled,
  })
}
