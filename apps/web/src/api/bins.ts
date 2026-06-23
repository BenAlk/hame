import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BinCollection,
  BinSyncResult,
  CreateBinInput,
  CreateScraperBinsInput,
  ScraperAddress,
  ScraperBin,
  ScraperCouncil,
  UpdateBinInput,
} from '@hame/shared'
import { apiFetch } from './client'

const BINS_KEY = ['bins'] as const

/** Bins drive the calendar feed too, so refresh both on any change. */
function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: BINS_KEY })
  void qc.invalidateQueries({ queryKey: ['calendar'] })
}

export function useBins() {
  return useQuery<BinCollection[]>({
    queryKey: BINS_KEY,
    queryFn: () => apiFetch<BinCollection[]>('/api/bins'),
  })
}

export function useCreateBin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateBinInput) =>
      apiFetch<BinCollection>('/api/bins', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidate(qc),
  })
}

/** Create every chosen bin for one scraped address in a single call. */
export function useCreateScraperBins() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateScraperBinsInput) =>
      apiFetch<BinCollection[]>('/api/bins/scraper-batch', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateBin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateBinInput & { id: string }) =>
      apiFetch<BinCollection>(`/api/bins/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => invalidate(qc),
  })
}

export function useDeleteBin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/bins/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(qc),
  })
}

/** Refresh an external bin's cached dates from its source on demand (spec §10 Phase 5.6). */
export function useSyncBin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<BinSyncResult>(`/api/bins/${id}/sync`, { method: 'POST' }),
    onSuccess: () => invalidate(qc),
  })
}

/** Councils the scraper supports — fetched lazily when the form needs them. */
export function useScraperCouncils(enabled = true) {
  return useQuery<ScraperCouncil[]>({
    queryKey: ['scraper-councils'],
    queryFn: () => apiFetch<ScraperCouncil[]>('/api/bins/councils'),
    staleTime: Infinity,
    enabled,
  })
}

/** Live address lookup for a council (street/postcode → candidate addresses). */
export function useSearchAddresses() {
  return useMutation({
    mutationFn: ({ councilId, q }: { councilId: string; q: string }) =>
      apiFetch<ScraperAddress[]>(
        `/api/bins/address-search?councilId=${encodeURIComponent(councilId)}&q=${encodeURIComponent(q)}`,
      ),
  })
}

/** The bins listed at a resolved address — populates the "which bin" dropdown. */
export function useAddressBins(councilId: string, addressId: string) {
  return useQuery<ScraperBin[]>({
    queryKey: ['scraper-bins', councilId, addressId],
    queryFn: () =>
      apiFetch<ScraperBin[]>(
        `/api/bins/source-bins?councilId=${encodeURIComponent(councilId)}&addressId=${encodeURIComponent(addressId)}`,
      ),
    enabled: Boolean(councilId && addressId),
    staleTime: 5 * 60 * 1000,
  })
}
