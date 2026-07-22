import { useMutation, useQuery } from '@tanstack/react-query'
import type { AlertRecipientsResponse, SendAlertInput, SendAlertResult } from '@hame/shared'
import { apiFetch } from './client'

/**
 * The recipient picker for the mobile top-bar alert modal (spec §10 Phase 12).
 * Returns the other members plus the `enabled` / `haConfigured` flags the button
 * uses to decide whether to render at all.
 */
export function useAlertRecipients() {
  return useQuery<AlertRecipientsResponse>({
    queryKey: ['alert-recipients'],
    queryFn: () => apiFetch<AlertRecipientsResponse>('/api/alerts/recipients'),
    staleTime: 60_000,
  })
}

/** Send one critical alert to a household member's phone. */
export function useSendAlert() {
  return useMutation<SendAlertResult, Error, SendAlertInput>({
    mutationFn: (body) =>
      apiFetch<SendAlertResult>('/api/alerts', { method: 'POST', body: JSON.stringify(body) }),
  })
}
