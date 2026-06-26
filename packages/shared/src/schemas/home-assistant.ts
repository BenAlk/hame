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
 * Entity domains surfaced to the dashboard (spec §8.11, §10 Phase 6.2/6.3). HA
 * exposes hundreds of entities; the registry and the `/entities` feed are scoped
 * to this dashboard-relevant set so the browser isn't flooded with internals.
 * `scene` / `script` joined in Phase 6.3 so the smart-home quick-controls widget
 * can list them — they carry no meaningful state, just a name and an action.
 * (`automation` is deliberately *not* here: triggering one is an allowed API
 * capability — see `HA_CONTROL_SERVICES` — but a household's automations would
 * flood the calm dashboard, so they aren't surfaced as default widget tiles.)
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
  'scene',
  'script',
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

/**
 * Device controls (spec §8.11, §10 Phase 6.3). The browser asks the API to run a
 * Home Assistant service via `call_service` over the existing WebSocket (commands
 * ride REST → the API relays them on the socket). This allowlist is the *only*
 * surface Hame will relay: a fixed set of (domain → services) covering the
 * smart-home widget's needs — toggle lights/switches/fans, activate scenes/scripts,
 * trigger automations. The API re-checks it server-side (defence in depth), so a
 * crafted request can't drive arbitrary HA services.
 */
export const HA_CONTROL_SERVICES: Record<string, readonly string[]> = {
  light: ['turn_on', 'turn_off', 'toggle'],
  switch: ['turn_on', 'turn_off', 'toggle'],
  fan: ['turn_on', 'turn_off', 'toggle'],
  scene: ['turn_on'],
  script: ['turn_on'],
  automation: ['trigger', 'turn_on', 'turn_off'],
}

/** Domains the widget renders as on/off toggles (they carry an on/off state). */
export const HA_TOGGLE_DOMAINS = ['light', 'switch', 'fan'] as const

/** Domains the widget renders as a momentary "run" button (no on/off state). */
export const HA_ACTIVATE_DOMAINS = ['scene', 'script'] as const

/** Every domain the smart-home widget can surface (toggles + run buttons). */
export const HA_CONTROLLABLE_DOMAINS = [...HA_TOGGLE_DOMAINS, ...HA_ACTIVATE_DOMAINS] as const

/** Whether an entity domain is one the smart-home widget can control. */
export function isControllableDomain(domain: string): boolean {
  return (HA_CONTROLLABLE_DOMAINS as readonly string[]).includes(domain)
}

/** The service the widget calls to "run" an activate-domain entity. */
export const HA_ACTIVATE_SERVICE: Record<string, string> = {
  scene: 'turn_on',
  script: 'turn_on',
  automation: 'trigger',
}

/** Whether Hame will relay this (domain, service) pair as a device control. */
export function isHaServiceAllowed(domain: string, service: string): boolean {
  return HA_CONTROL_SERVICES[domain]?.includes(service) ?? false
}

/** A request to run one HA service against one entity (spec §10 Phase 6.3). */
export const HaServiceCallSchema = z
  .object({
    domain: z.string().min(1).max(50),
    service: z.string().min(1).max(50),
    entityId: z.string().min(1).max(200),
  })
  .refine((c) => isHaServiceAllowed(c.domain, c.service), {
    message: 'That Home Assistant service is not permitted.',
  })
export type HaServiceCallInput = z.infer<typeof HaServiceCallSchema>

/** Outcome of relaying a service call to Home Assistant. */
export const HaServiceCallResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
})
export type HaServiceCallResult = z.infer<typeof HaServiceCallResultSchema>

/**
 * A Home Assistant calendar entity (spec §8.10, §10 Phase 6.3). Listed so an
 * admin can add one as a `CalendarSource` (its `entityId` is stored in the
 * source's `url` field, which for HA holds an entity id rather than a feed URL).
 */
export const HaCalendarSchema = z.object({
  entityId: z.string(),
  name: z.string(),
})
export type HaCalendar = z.infer<typeof HaCalendarSchema>

/**
 * A Home Assistant bin-collection sensor (spec §8.9, §10 Phase 6 — the last
 * unwired bin source). The community "UK Bin Collection Data" integration exposes
 * each bin as a `sensor.*` whose next-collection date Hame reads. Listed so a
 * household can pick one for a `HOME_ASSISTANT` bin (its `entityId` is stored in
 * the source config); `nextCollection` lets the picker preview the date it found.
 */
export const HaBinSensorSchema = z.object({
  entityId: z.string(),
  name: z.string(),
  /** Null when HA currently has no date for the bin (e.g. the sensor is
   * `unavailable`); the bin is still listed so it can be picked, and fills in
   * once HA resolves it. */
  nextCollection: z.coerce.date().nullable(),
})
export type HaBinSensor = z.infer<typeof HaBinSensorSchema>

/**
 * An owner's curated smart-home controls (spec §8.12, §10 Phase 6.3, 7.1b).
 * Rather than flood the dashboard with every controllable HA entity, each owner
 * (a user, or the shared household/tablet) picks a few on the Smart-home page;
 * the widget renders just these, in this order. Selection only — never the state.
 */
export const SmartHomeSettingsSchema = z.object({
  entityIds: z.array(z.string()),
})
export type SmartHomeSettings = z.infer<typeof SmartHomeSettingsSchema>

/** Replace the curated control list (the Smart-home page's Save). */
export const UpdateSmartHomeSettingsSchema = z.object({
  entityIds: z.array(z.string().min(1).max(200)).max(100),
})
export type UpdateSmartHomeSettingsInput = z.infer<typeof UpdateSmartHomeSettingsSchema>

/**
 * Resolve one or more new-device suggestions (spec §10 Phase 6.3): add them to
 * the widget, or dismiss them. Either way they join the "already offered" set so
 * the dashboard prompt stops asking about them.
 */
export const SmartHomeEntityIdsSchema = z.object({
  entityIds: z.array(z.string().min(1).max(200)).min(1).max(100),
})
export type SmartHomeEntityIdsInput = z.infer<typeof SmartHomeEntityIdsSchema>
