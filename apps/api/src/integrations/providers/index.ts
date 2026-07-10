/**
 * Pluggable integration providers (spec §9.9, §10 Phase 10) — the bin-source seam
 * (integrations/bin-sources) generalised. A provider pulls data from an external
 * self-hosted service and returns it **normalised**: a STATUS provider a metric
 * snapshot for a dashboard tile, a CALENDAR provider dated events the aggregated
 * calendar merges in. The provider owns its transport (a plain HTTP GET for Gitea,
 * a WebSocket handshake for TrueNAS later), so this seam only ever sees normalised
 * output — which is what lets one abstraction span both.
 *
 * This file is the registry. New providers are one module + a `registerIntegrationProvider`
 * call in {@link registerBuiltInIntegrationProviders} — the same "drop in a module"
 * contribution model as a bin-scraper council.
 */
import type {
  IntegrationFieldSpec,
  IntegrationKind,
  IntegrationProviderInfo,
  IntegrationSnapshot,
} from '@hame/shared'
import { giteaProvider } from './gitea.js'
import { truenasProvider } from './truenas.js'

/** Decrypted config + secret handed to a provider at fetch / test time. */
export interface IntegrationContext {
  config: Record<string, unknown>
  /** The decrypted provider credential, or null when none is configured. */
  secret: string | null
}

/** The window a CALENDAR provider fetches events for (bounds the cache). */
export interface IntegrationFetchHorizon {
  start: Date
  end: Date
}

/** A dated event a CALENDAR provider emits — cached as an `IntegrationEvent` row. */
export interface FetchedIntegrationEvent {
  /** Stable dedupe key within this integration (e.g. `milestone:42`). */
  externalId: string
  title: string
  startTime: Date
  endTime?: Date | null
  allDay?: boolean
}

interface BaseProvider {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly configFields: readonly IntegrationFieldSpec[]
  readonly secretFields: readonly IntegrationFieldSpec[]
  /** Probe reachability with the given config/secret. Throws on failure. */
  test(ctx: IntegrationContext): Promise<void>
}

export interface StatusIntegrationProvider extends BaseProvider {
  readonly kind: 'STATUS'
  /** Fetch the current reading. Throws on failure; the service keeps the last snapshot. */
  fetchSnapshot(ctx: IntegrationContext): Promise<IntegrationSnapshot>
}

export interface CalendarIntegrationProvider extends BaseProvider {
  readonly kind: 'CALENDAR'
  /** Fetch dated events in the horizon. Throws on failure; the service keeps the cache. */
  fetchEvents(
    ctx: IntegrationContext,
    horizon: IntegrationFetchHorizon,
  ): Promise<FetchedIntegrationEvent[]>
}

export type IntegrationProvider = StatusIntegrationProvider | CalendarIntegrationProvider

const providers = new Map<string, IntegrationProvider>()

export function registerIntegrationProvider(provider: IntegrationProvider): void {
  providers.set(provider.id, provider)
}

/** The provider for an id, or null when none is registered (e.g. a removed module). */
export function getIntegrationProvider(id: string): IntegrationProvider | null {
  return providers.get(id) ?? null
}

/** Every registered provider, for the "add integration" catalogue. */
export function listIntegrationProviders(): IntegrationProvider[] {
  return [...providers.values()]
}

/** The public catalogue shape (no behaviour) — safe to send to the client. */
export function toProviderInfo(provider: IntegrationProvider): IntegrationProviderInfo {
  return {
    id: provider.id,
    name: provider.name,
    kind: provider.kind as IntegrationKind,
    description: provider.description,
    configFields: provider.configFields.map((f) => ({ ...f })),
    secretFields: provider.secretFields.map((f) => ({ ...f })),
  }
}

/**
 * Register the providers that ship with Hame. Called once from `createApp()` (so
 * it also runs under supertest), mirroring `registerBuiltInBinProviders`.
 * Idempotent — registration is a keyed Map write.
 */
export function registerBuiltInIntegrationProviders(): void {
  registerIntegrationProvider(giteaProvider)
  registerIntegrationProvider(truenasProvider)
}
