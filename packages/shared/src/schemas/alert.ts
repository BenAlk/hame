import { z } from 'zod'

/**
 * Household critical-alert "poke" (spec §10 Phase 12). A member sends a short,
 * urgent message to another member's phone as a critical push via Home Assistant
 * — the "come here / dinner's ready" affordance surfaced on the mobile top bar.
 * Fire-and-forget: nothing is persisted, so there is no read model beyond the
 * recipient picker.
 */

/** A member the caller can alert, with whether their phone is set up to receive. */
export const AlertRecipientSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  colour: z.string(),
  /** True when the member has picked a phone (`haNotifyService`) in their Profile. */
  canReceive: z.boolean(),
  /**
   * True when this alert will actually turn their phone up (§10 Phase 21): they
   * opted in *and* Home Assistant can currently read the settings the escalation
   * would need to restore. False means the alert still sends — it just falls back
   * to the plain critical push, which a handset may choose to silence. Surfaced so
   * the sender knows which of the two they're getting *before* they send, rather
   * than inferring it from a phone that never rang.
   */
  willBreakThrough: z.boolean(),
})
export type AlertRecipient = z.infer<typeof AlertRecipientSchema>

/**
 * The recipient picker's payload. `enabled` reflects the household toggle and
 * `haConfigured` whether Home Assistant is connected — the top-bar icon shows
 * only when both hold and there is at least one other member.
 */
export const AlertRecipientsResponseSchema = z.object({
  enabled: z.boolean(),
  haConfigured: z.boolean(),
  recipients: z.array(AlertRecipientSchema),
})
export type AlertRecipientsResponse = z.infer<typeof AlertRecipientsResponseSchema>

/** Send one alert: a recipient and a short message (the push body). */
export const SendAlertSchema = z.object({
  recipientId: z.string().uuid(),
  message: z.string().trim().min(1, 'Enter a message').max(200, 'Keep it under 200 characters'),
})
export type SendAlertInput = z.infer<typeof SendAlertSchema>

/** Whether Home Assistant accepted the push (false = recipient unreachable). */
export const SendAlertResultSchema = z.object({
  delivered: z.boolean(),
})
export type SendAlertResult = z.infer<typeof SendAlertResultSchema>
