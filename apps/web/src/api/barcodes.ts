import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { BarcodeResolution, LinkBarcodeInput } from '@hame/shared'
import { apiFetch } from './client'

/**
 * Resolve a scanned code. A mutation rather than a query: scans arrive as
 * one-off events during a session, and caching them by code would hide the
 * point at which a code becomes linked.
 */
export function useResolveBarcode() {
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<BarcodeResolution>(`/api/barcodes/${encodeURIComponent(code)}`),
  })
}

export function useLinkBarcode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LinkBarcodeInput) =>
      apiFetch<void>('/api/barcodes', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
}
