import { z } from 'zod'
import {
  INTEGRATION_KINDS,
  INTEGRATION_METRIC_STATES,
  MAX_INTEGRATION_POLL_SECONDS,
  MIN_INTEGRATION_POLL_SECONDS,
} from '../constants/index.js'

/**
 * Integration framework contract (spec §9.9, §10 Phase 10). An `Integration` is a
 * configured instance of a first-party provider that pulls data from an external
 * self-hosted service. The provider owns its transport and returns **normalised**
 * data — a STATUS snapshot for a dashboard tile, or CALENDAR events the aggregated
 * calendar merges in. The provider's `config`/`secret` field specs drive a generic
 * settings form, so a new provider ships zero bespoke UI. The `secret` is
 * AES-256-GCM encrypted at rest (spec §11) and, like the HA token / Immich key, is
 * **never** returned — the read shape carries only `hasSecret`.
 */

export const IntegrationKindSchema = z.enum(INTEGRATION_KINDS)

/** How a provider config/secret field renders in the generic add/edit form. */
export const IntegrationFieldTypeSchema = z.enum(['text', 'url', 'number', 'password'])
export type IntegrationFieldType = z.infer<typeof IntegrationFieldTypeSchema>

/** One field a provider needs, describing how to render + label its form input. */
export const IntegrationFieldSpecSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: IntegrationFieldTypeSchema,
  placeholder: z.string().optional(),
  help: z.string().optional(),
  /** Optional inputs (e.g. an org filter) are marked so the form can allow blank. */
  required: z.boolean().default(true),
})
export type IntegrationFieldSpec = z.infer<typeof IntegrationFieldSpecSchema>

/**
 * Public description of a registered provider (the `GET /providers` catalogue).
 * Drives the "add integration" picker and the dynamic config form; `secretFields`
 * are write-only inputs whose values never come back from the server.
 */
export const IntegrationProviderInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: IntegrationKindSchema,
  description: z.string(),
  configFields: z.array(IntegrationFieldSpecSchema),
  secretFields: z.array(IntegrationFieldSpecSchema),
})
export type IntegrationProviderInfo = z.infer<typeof IntegrationProviderInfoSchema>

/** One normalised metric from a STATUS provider; `state` colours its tile. */
export const IntegrationMetricSchema = z.object({
  label: z.string(),
  value: z.string(),
  state: z.enum(INTEGRATION_METRIC_STATES).default('unknown'),
})
export type IntegrationMetric = z.infer<typeof IntegrationMetricSchema>

/** A STATUS provider's cached reading — the payload the generic tile renders. */
export const IntegrationSnapshotSchema = z.object({
  metrics: z.array(IntegrationMetricSchema),
})
export type IntegrationSnapshot = z.infer<typeof IntegrationSnapshotSchema>

const pollInterval = z
  .number()
  .int()
  .min(MIN_INTEGRATION_POLL_SECONDS)
  .max(MAX_INTEGRATION_POLL_SECONDS)

/** Public/read shape of a configured integration — never includes the secret. */
export const IntegrationSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  kind: IntegrationKindSchema,
  name: z.string(),
  config: z.record(z.unknown()),
  /** Whether a secret is stored, so the UI shows "set" without the value. */
  hasSecret: z.boolean(),
  isActive: z.boolean(),
  pollIntervalSeconds: z.number().int().positive(),
  /** Latest STATUS reading; null for CALENDAR integrations or before first poll. */
  snapshot: IntegrationSnapshotSchema.nullable(),
  lastSyncedAt: z.coerce.date().nullable(),
  /** Last poll failure, cleared on the next success (graceful-degrade, §9.6). */
  lastError: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type Integration = z.infer<typeof IntegrationSchema>

/** Create an integration. `config` is validated per-provider at fetch time. */
export const CreateIntegrationSchema = z.object({
  providerId: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  config: z.record(z.unknown()).default({}),
  secret: z.string().min(1).max(2000).optional(),
  isActive: z.boolean().optional(),
  pollIntervalSeconds: pollInterval.optional(),
})
export type CreateIntegrationInput = z.infer<typeof CreateIntegrationSchema>

/** Update an integration. Omitting `secret` keeps the stored one (spec §11). */
export const UpdateIntegrationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
  secret: z.string().min(1).max(2000).optional(),
  isActive: z.boolean().optional(),
  pollIntervalSeconds: pollInterval.optional(),
})
export type UpdateIntegrationInput = z.infer<typeof UpdateIntegrationSchema>

/** Probe an unsaved provider + config + secret before committing it. */
export const TestIntegrationSchema = z.object({
  providerId: z.string().min(1).max(50),
  config: z.record(z.unknown()).default({}),
  secret: z.string().max(2000).optional(),
})
export type TestIntegrationInput = z.infer<typeof TestIntegrationSchema>

/** Outcome of a connection test: reachability + a human message. */
export const IntegrationTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
})
export type IntegrationTestResult = z.infer<typeof IntegrationTestResultSchema>

/**
 * Member-readable status of an active STATUS integration (the dashboard widget
 * feed). Mirrors how Home Assistant entity reads are member-level while the config
 * stays admin-only — it carries only the rendered snapshot, never config or the
 * secret.
 */
export const IntegrationStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  providerId: z.string(),
  snapshot: IntegrationSnapshotSchema.nullable(),
  lastSyncedAt: z.coerce.date().nullable(),
  lastError: z.string().nullable(),
})
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>
