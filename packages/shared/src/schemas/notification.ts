import { z } from 'zod'

/**
 * Per-user notification preferences (spec §8.13, §10 Phase 8). Each user toggles
 * the reminder categories and points push at their own phone. Scheduled reminders
 * are delivered through Home Assistant's mobile-app notify service (HA owns the
 * phone push); in-app toasts (Phase 8.1) are separate and always on. There is no
 * stored notification feed — a reminder fires once at its moment (spec §7 models
 * none), so these schemas are just the preference shape, not a notification list.
 */

/** The toggleable reminder categories (mirrors the dashboard widget set). */
export const NOTIFICATION_CATEGORIES = [
  'binReminders',
  'choreReminders',
  'expiryWarnings',
  'lowStockAlerts',
  'petCareReminders',
  'customEventReminders',
] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

/** Public/read shape of a user's preferences. */
export const NotificationPreferenceSchema = z.object({
  binReminders: z.boolean(),
  choreReminders: z.boolean(),
  expiryWarnings: z.boolean(),
  lowStockAlerts: z.boolean(),
  petCareReminders: z.boolean(),
  customEventReminders: z.boolean(),
  /** Master switch for Home Assistant phone push (in-app toasts are unaffected). */
  pushViaHA: z.boolean(),
  /** The chosen `notify.*` target for this user's phone, or null if unset. */
  haNotifyService: z.string().nullable(),
  /** Opt-in high-priority / iOS critical alert that breaks through silent/DND. */
  criticalAlerts: z.boolean(),
})
export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>

/** Partial update — every field optional; omitted fields keep their value. */
export const UpdateNotificationPreferenceSchema = z
  .object({
    binReminders: z.boolean(),
    choreReminders: z.boolean(),
    expiryWarnings: z.boolean(),
    lowStockAlerts: z.boolean(),
    petCareReminders: z.boolean(),
    customEventReminders: z.boolean(),
    pushViaHA: z.boolean(),
    // Empty string clears the target (back to "no phone chosen"); otherwise the
    // notify service name, e.g. `mobile_app_bens_phone`.
    haNotifyService: z.string().max(200).nullish(),
    criticalAlerts: z.boolean(),
  })
  .partial()
export type UpdateNotificationPreferenceInput = z.infer<typeof UpdateNotificationPreferenceSchema>

/**
 * A Home Assistant `notify.*` target a user can pick for their phone (spec §10
 * Phase 8). Discovered from HA's service registry; `service` is the part after
 * `notify.` (e.g. `mobile_app_bens_phone`), `name` a friendly label for the
 * dropdown. The mobile-app integration creates one per registered device.
 */
export const HaNotifyTargetSchema = z.object({
  service: z.string(),
  name: z.string(),
})
export type HaNotifyTarget = z.infer<typeof HaNotifyTargetSchema>
