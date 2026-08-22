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
  climate: ['set_temperature', 'set_hvac_mode', 'set_preset_mode', 'turn_on', 'turn_off'],
}

/** Domains the widget renders as on/off toggles (they carry an on/off state). */
export const HA_TOGGLE_DOMAINS = ['light', 'switch', 'fan'] as const

/** Domains the widget renders as a momentary "run" button (no on/off state). */
export const HA_ACTIVATE_DOMAINS = ['scene', 'script'] as const

/** Domains the widget renders as a target-temperature control (spec §8.11 heating). */
export const HA_SETPOINT_DOMAINS = ['climate'] as const

/** Every domain the smart-home widget can surface (toggles, run buttons, setpoints). */
export const HA_CONTROLLABLE_DOMAINS = [
  ...HA_TOGGLE_DOMAINS,
  ...HA_ACTIVATE_DOMAINS,
  ...HA_SETPOINT_DOMAINS,
] as const

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

/**
 * The HVAC modes Hame will set. Deliberately narrower than Home Assistant's own
 * set: the wall tablet controls heating, so it offers "on" and "off" and leaves
 * cooling, drying and the auto blends to HA itself. A mode Hame can't set is
 * still *displayed* faithfully — the widget reads the entity's real state.
 */
export const HA_HVAC_MODES = ['off', 'heat'] as const
export type HaHvacMode = (typeof HA_HVAC_MODES)[number]

/**
 * The absolute envelope any setpoint must fall inside, whatever a device claims.
 * This is a backstop against a crafted request, not the range shown to anyone:
 * the widget offers — and the API clamps to — the entity's own `min_temp` /
 * `max_temp`, which is the device's truth. Chosen to span frost protection at the
 * bottom and any plausible domestic thermostat at the top.
 */
export const HA_SETPOINT_FLOOR_C = 4
export const HA_SETPOINT_CEILING_C = 35

/**
 * Payload schemas per allowlisted service, keyed `domain.service`.
 *
 * Until heating, every control Hame relayed was a verb with no argument, so
 * allowlisting (domain, service) fully determined the effect. A setpoint breaks
 * that: "set temperature" is only safe alongside *what* temperature. So each
 * service that takes a payload declares its exact shape, `.strict()` so an
 * unknown key is refused rather than quietly forwarded to Home Assistant — and a
 * service absent from this map accepts no payload at all. Deny by default, the
 * same stance as the service allowlist it extends.
 */
const HA_SERVICE_DATA_SCHEMAS: Record<string, z.ZodType<Record<string, unknown>>> = {
  'climate.set_temperature': z
    .object({
      temperature: z.number().min(HA_SETPOINT_FLOOR_C).max(HA_SETPOINT_CEILING_C),
    })
    .strict(),
  'climate.set_hvac_mode': z
    .object({
      hvac_mode: z.enum(HA_HVAC_MODES),
    })
    .strict(),
  // Unlike an HVAC mode, a preset's vocabulary belongs to the *integration*, not
  // to Home Assistant: a Tuya thermostat offers `auto`/`manual`, others `eco` or
  // `boost`, and HA's own PRESET_* constants cover none of the first pair. An
  // enum here would refuse real devices, so the constant bounds only the shape —
  // the binding check is against the entity's own advertised `preset_modes`, in
  // the service, where the registry is (§10 Phase 23).
  'climate.set_preset_mode': z
    .object({
      preset_mode: z.string().min(1).max(64),
    })
    .strict(),
}

/** The payload schema for an allowlisted service, or null if it takes none. */
export function haServiceDataSchema(
  domain: string,
  service: string,
): z.ZodType<Record<string, unknown>> | null {
  return HA_SERVICE_DATA_SCHEMAS[`${domain}.${service}`] ?? null
}

/**
 * Re-derive a clean payload for an allowlisted service, throwing on anything the
 * schema refuses. The API calls this rather than forwarding the request body: the
 * request schema validates `data` but doesn't *replace* it (it's typed as an open
 * record at the top level), so parsing again here is what guarantees only
 * declared keys ever reach Home Assistant — defence in depth, as with the
 * allowlist re-check beside it.
 */
export function sanitiseHaServiceData(
  domain: string,
  service: string,
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const schema = haServiceDataSchema(domain, service)
  if (!schema) return undefined
  return schema.parse(data ?? {})
}

/** A request to run one HA service against one entity (spec §10 Phase 6.3). */
export const HaServiceCallSchema = z
  .object({
    domain: z.string().min(1).max(50),
    service: z.string().min(1).max(50),
    entityId: z.string().min(1).max(200),
    /** Service arguments, for the services that take them (e.g. a setpoint). */
    data: z.record(z.unknown()).optional(),
  })
  .superRefine((call, ctx) => {
    if (!isHaServiceAllowed(call.domain, call.service)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'That Home Assistant service is not permitted.',
      })
      return
    }
    const schema = haServiceDataSchema(call.domain, call.service)
    if (!schema) {
      // An argument-less service given arguments is refused rather than ignored:
      // silently dropping it would let a request appear to do something it can't.
      if (call.data && Object.keys(call.data).length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['data'],
          message: 'That Home Assistant service takes no arguments.',
        })
      }
      return
    }
    const parsed = schema.safeParse(call.data ?? {})
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['data'],
        message: parsed.error.issues[0]?.message ?? 'Invalid arguments for that service.',
      })
    }
  })
export type HaServiceCallInput = z.infer<typeof HaServiceCallSchema>

/** Outcome of relaying a service call to Home Assistant. */
export const HaServiceCallResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
})
export type HaServiceCallResult = z.infer<typeof HaServiceCallResultSchema>

/**
 * A climate entity read into the fields a thermostat control needs (spec §8.11).
 * Home Assistant publishes these as loose attributes; this narrows them once, so
 * neither the widget nor the API's clamp has to re-derive them.
 *
 * `min`/`max` are the device's own range, themselves held inside the absolute
 * envelope so a misreporting integration can't widen what Hame will send. A
 * climate entity's `state` *is* its HVAC mode, so "on" is simply "not off".
 */
export interface HaClimateView {
  current: number | null
  target: number | null
  min: number
  max: number
  step: number
  isOn: boolean
  /** What the thermostat says it is *doing* (`hvac_action`), when it publishes it. */
  action: string | null
  /** The modes this device will actually accept — not what Hame would like to send. */
  hvacModes: string[]
  /** The presets it offers (`auto`/`manual`, `eco`…), and which one is active. */
  presets: string[]
  preset: string | null
}

/** HA's own fallbacks when a climate entity declines to publish a range. */
const DEFAULT_MIN_TEMP = 7
const DEFAULT_MAX_TEMP = 35
const DEFAULT_TEMP_STEP = 0.5

export function haClimateView(entity: HaEntityState): HaClimateView {
  const attrs = entity.attributes
  const min = clampToEnvelope(numberAttr(attrs.min_temp) ?? DEFAULT_MIN_TEMP)
  const max = clampToEnvelope(numberAttr(attrs.max_temp) ?? DEFAULT_MAX_TEMP)
  return {
    current: numberAttr(attrs.current_temperature),
    target: numberAttr(attrs.temperature),
    min: Math.min(min, max),
    max: Math.max(min, max),
    step: numberAttr(attrs.target_temp_step) ?? DEFAULT_TEMP_STEP,
    isOn: entity.state !== 'off',
    action: stringAttr(attrs.hvac_action),
    hvacModes: stringListAttr(attrs.hvac_modes),
    presets: stringListAttr(attrs.preset_modes),
    preset: stringAttr(attrs.preset_mode),
  }
}

function numberAttr(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringAttr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function stringListAttr(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * How to turn this particular thermostat on.
 *
 * Hame used to assume `set_hvac_mode: heat`, which is wrong on any device that
 * doesn't list `heat` — a Tuya thermostat whose only on-mode is `heat_cool`
 * rejects it outright, so the widget could switch the heating off and then not
 * back on. `climate.turn_on` avoids the question entirely by letting the device
 * pick its own on-mode, so it is preferred wherever the entity advertises it
 * (`TURN_ON`, feature bit 256). Failing that, the mode is chosen from what the
 * device actually lists rather than from what Hame would like to send.
 *
 * Returns null when a device advertises no way to be turned on at all, so the
 * caller can hide the control rather than offer one that cannot work.
 */
export function climateOnCall(
  view: HaClimateView,
): { service: string; data?: Record<string, unknown> } | null {
  if (view.hvacModes.length === 0) return { service: 'turn_on' }
  for (const mode of HA_HVAC_MODES) {
    if (mode !== 'off' && view.hvacModes.includes(mode)) {
      return { service: 'set_hvac_mode', data: { hvac_mode: mode } }
    }
  }
  // The device heats under a name Hame doesn't set (`heat_cool`, `auto`); let it
  // choose for itself rather than naming a mode this allowlist won't carry.
  const onModes = view.hvacModes.filter((m) => m !== 'off')
  return onModes.length > 0 ? { service: 'turn_on' } : null
}

/** How to turn it off — `off` is universal enough to name, but not to assume. */
export function climateOffCall(view: HaClimateView): {
  service: string
  data?: Record<string, unknown>
} {
  return view.hvacModes.includes('off')
    ? { service: 'set_hvac_mode', data: { hvac_mode: 'off' } }
    : { service: 'turn_off' }
}

/**
 * Presets that mean "the thermostat is running its own schedule".
 *
 * A heuristic over a device-defined vocabulary, and deliberately a short one: it
 * only decides whether the widget adds the caption saying a change lasts until
 * the next scheduled change. An unrecognised preset says nothing rather than
 * claiming something wrong.
 */
const SCHEDULE_PRESETS = ['auto', 'program', 'programme', 'schedule', 'scheduled']

export function isSchedulePreset(preset: string | null): boolean {
  return preset !== null && SCHEDULE_PRESETS.includes(preset.toLowerCase())
}

/** What the heating widget says a thermostat is doing right now. */
export type HaClimateStatus = 'off' | 'heating' | 'idle'

/**
 * Whether the boiler is actually firing, rather than whether the number is higher.
 *
 * A thermostat that publishes `hvac_action` is answering this question itself, so
 * that answer wins — it knows about its own hysteresis, its minimum run time and
 * whether the call for heat reached the boiler at all. Only when it publishes
 * nothing does this fall back to comparing target against room temperature, which
 * is a fair guess and no more: it will read "heating" through the deadband where a
 * real thermostat has already stopped.
 */
export function climateStatus(view: HaClimateView): HaClimateStatus {
  if (!view.isOn) return 'off'
  if (view.action !== null) return view.action === 'heating' ? 'heating' : 'idle'
  if (view.target === null || view.current === null) return 'idle'
  return view.target > view.current ? 'heating' : 'idle'
}

function clampToEnvelope(value: number): number {
  return Math.min(Math.max(value, HA_SETPOINT_FLOOR_C), HA_SETPOINT_CEILING_C)
}

/** Round a setpoint to the device's step and hold it inside its own range —
 *  what the widget offers and what the API enforces before relaying. */
export function clampSetpoint(value: number, view: HaClimateView): number {
  const stepped = view.step > 0 ? Math.round(value / view.step) * view.step : value
  const bounded = Math.min(Math.max(stepped, view.min), view.max)
  // Steps like 0.1 make binary fractions; round off the noise they leave behind.
  return Math.round(bounded * 100) / 100
}

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

/** The forecast granularity Hame requests (spec §10, weather forecast modal). Only
 *  `hourly` is wired to a UI today; `daily` is the same HA call for a later toggle. */
export const HA_FORECAST_TYPES = ['hourly', 'daily'] as const
export type HaForecastType = (typeof HA_FORECAST_TYPES)[number]

/**
 * One point in a Home Assistant weather forecast (spec §10, weather forecast
 * modal). HA's `weather/get_forecasts` WS command returns each entry already
 * converted to the entity's display units, with the `native_` prefix stripped
 * (e.g. `native_temperature` → `temperature`) — this is that shape, camelCased.
 * Every field but `datetime` is nullable: not every weather integration (or every
 * point in an hourly run) publishes all of them.
 */
export const HaForecastEntrySchema = z.object({
  datetime: z.coerce.date(),
  condition: z.string().nullable(),
  temperature: z.number().nullable(),
  precipitationProbability: z.number().nullable(),
  humidity: z.number().nullable(),
  windSpeed: z.number().nullable(),
  isDaytime: z.boolean().nullable(),
})
export type HaForecastEntry = z.infer<typeof HaForecastEntrySchema>

/** Query params for the forecast endpoint — `type` defaults to `hourly`, the
 *  only granularity a UI reads today. */
export const HaForecastQuerySchema = z.object({
  type: z.enum(HA_FORECAST_TYPES).default('hourly'),
})
export type HaForecastQuery = z.infer<typeof HaForecastQuerySchema>

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
