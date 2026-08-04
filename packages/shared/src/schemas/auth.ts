import { z } from 'zod'
import { CreateUserSchema, PublicUserSchema, TabletCredentialsSchema } from './user.js'

export const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  /**
   * Opt in to the long (on-LAN) idle window on this device even when the
   * request arrives from outside the network — for a personal phone whose PWA
   * would otherwise be signed out after the short external window (spec §11).
   * Off by default, so a shared or one-off browser keeps the strict window.
   */
  trustDevice: z.boolean().default(false),
})
export type LoginInput = z.infer<typeof LoginSchema>

/**
 * First-run setup: creates the initial admin. Role is forced to ADMIN
 * server-side, so it is intentionally omitted from the input here. The
 * `setupToken` is a one-time secret the server prints to its logs on first boot
 * (spec §8.1) — it must be echoed back here so a publicly-reachable instance
 * can't be claimed by whoever loads /setup first.
 */
export const SetupSchema = CreateUserSchema.omit({ role: true }).extend({
  setupToken: z.string().min(1, 'Setup token is required'),
})
export type SetupInput = z.infer<typeof SetupSchema>

export const SetupStatusSchema = z.object({
  requiresSetup: z.boolean(),
})
export type SetupStatus = z.infer<typeof SetupStatusSchema>

/**
 * The result of first-run setup: the created admin, plus the shared wall-tablet
 * account's login (spec §8.1) — auto-provisioned alongside the admin and shown
 * once here so the operator can sign the tablet in. Its password is never
 * returned again; re-issue it later from Settings → Users if lost.
 */
export const SetupResultSchema = z.object({
  admin: PublicUserSchema,
  tablet: TabletCredentialsSchema,
})
export type SetupResult = z.infer<typeof SetupResultSchema>
