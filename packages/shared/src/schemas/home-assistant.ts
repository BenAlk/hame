import { z } from 'zod'

/**
 * Home Assistant connection settings (spec §8.11, §10 Phase 6). A singleton
 * mirroring the Ollama/Immich config pattern — URL + a long-lived access token.
 * Unlike Ollama, the token is a secret: it is AES-256-GCM encrypted at rest
 * (spec §11) and **never** leaves the API, so the read shape below carries only
 * `hasToken`, never the token itself.
 */

/** Live state of the API's outbound WebSocket to Home Assistant. */
export const HA_CONNECTION_STATUSES = [
  'disconnected',
  'connecting',
  'connected',
  'auth_failed',
  'error',
] as const
export type HaConnectionStatus = (typeof HA_CONNECTION_STATUSES)[number]

/** Public/read shape — safe to send to the client; never includes the token. */
export const HomeAssistantConfigSchema = z.object({
  url: z.string().nullable(),
  /** Whether a token is stored, so the UI can show "token set" without it. */
  hasToken: z.boolean(),
  isActive: z.boolean(),
  lastConnectedAt: z.coerce.date().nullable(),
  updatedAt: z.coerce.date(),
  /** Live connection status (not persisted; from the client singleton). */
  status: z.enum(HA_CONNECTION_STATUSES),
  haVersion: z.string().nullable(),
  lastError: z.string().nullable(),
})
export type HomeAssistantConfig = z.infer<typeof HomeAssistantConfigSchema>

/** Update the saved config. Omitting `accessToken` keeps the stored one. */
export const UpdateHomeAssistantConfigSchema = z.object({
  url: z.string().url('Enter a valid URL').max(300),
  accessToken: z.string().min(1).max(2000).optional(),
  isActive: z.boolean().optional(),
})
export type UpdateHomeAssistantConfigInput = z.infer<typeof UpdateHomeAssistantConfigSchema>

/** Test an unsaved URL + token pair before committing it. */
export const TestHomeAssistantSchema = z.object({
  url: z.string().url('Enter a valid URL').max(300),
  accessToken: z.string().min(1, 'A token is required to test').max(2000),
})
export type TestHomeAssistantInput = z.infer<typeof TestHomeAssistantSchema>

/** Result of probing a Home Assistant server: reachability + reported version. */
export const HomeAssistantTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  version: z.string().optional(),
})
export type HomeAssistantTestResult = z.infer<typeof HomeAssistantTestResultSchema>

/**
 * Entity domains surfaced to the dashboard (spec §8.11, §10 Phase 6.2). HA
 * exposes hundreds of entities; the registry and the `/entities` feed are scoped
 * to this dashboard-relevant set so the browser isn't flooded with internals.
 */
export const HA_DASHBOARD_DOMAINS = [
  'weather',
  'sensor',
  'binary_sensor',
  'light',
  'switch',
  'climate',
  'cover',
  'lock',
  'fan',
  'person',
  'sun',
] as const

/**
 * One Home Assistant entity's current state (spec §8.11). A live projection of
 * HA's own state object — never persisted (no state mirroring; Hame queries HA
 * live and caches in memory only). `attributes` is an open bag (e.g. a weather
 * entity's `temperature`); consumers narrow what they need.
 */
export const HaEntityStateSchema = z.object({
  entityId: z.string(),
  domain: z.string(),
  state: z.string(),
  friendlyName: z.string().nullable(),
  attributes: z.record(z.unknown()),
  lastChanged: z.coerce.date().nullable(),
})
export type HaEntityState = z.infer<typeof HaEntityStateSchema>
