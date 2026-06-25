/**
 * Pluggable bin-source providers (spec §8.9, §10 Phase 5.6).
 *
 * A bin's collection dates come from its source. `MANUAL` bins compute their
 * dates from the recurrence engine and never reach this layer; the external
 * sources fetch dates that a sync caches as `BinOccurrence` rows and re-fetches
 * on a schedule, so the cache self-corrects (a bank-holiday shift just appears).
 *
 * This file is the seam: one {@link BinScheduleProvider} contract and a registry
 * the bin service dispatches through. The providers themselves — iCal, the UK
 * council scraper, and Home Assistant — are the documented next steps and land
 * one at a time behind this interface. Until a provider is registered, syncing an
 * external bin degrades gracefully with a clear message rather than failing.
 */
import type { BinSourceConfig, BinSourceType } from '@hame/shared'
import { icalBinProvider } from './ical-bin-source.js'
import { scraperBinProvider } from './scraper-bin-source.js'
import { haBinProvider } from './ha-bin-source.js'

/** A single collection date fetched from an external source, ready to cache. */
export interface FetchedBinOccurrence {
  date: Date
}

/** The window a sync fetches occurrences for. */
export interface BinSyncHorizon {
  start: Date
  end: Date
}

/**
 * Extra hints the bin service passes into a sync. `priorAnchor` is the most
 * recent cached collection date for the bin — a provider that reads only "this
 * week" (the council scraper) uses it to resolve a cycle phase a single reading
 * can't. Providers that fetch a full schedule (iCal) ignore it.
 */
export interface BinSyncContext {
  priorAnchor?: Date
}

/**
 * Turns an external source's config into concrete collection dates. Implementations
 * are pure of persistence — the bin service caches what they return. They should
 * throw on a failed fetch; the service degrades gracefully and keeps the old cache.
 */
export interface BinScheduleProvider {
  readonly type: Exclude<BinSourceType, 'MANUAL'>
  fetchOccurrences(
    config: BinSourceConfig,
    horizon: BinSyncHorizon,
    context?: BinSyncContext,
  ): Promise<FetchedBinOccurrence[]>
}

/**
 * Registered external providers, keyed by source type, wired by
 * {@link registerBuiltInBinProviders} (spec §10 Phase 5.6 / Phase 6):
 *   ICAL          → integrations/ical (reuses the calendar-subscription fetch) ✓
 *   SCRAPER       → the uk-bin-scraper library (spec §12) ✓
 *   HOME_ASSISTANT → HA bin sensors via the Phase 6 WebSocket client registry ✓
 */
const providers = new Map<BinScheduleProvider['type'], BinScheduleProvider>()

export function registerBinProvider(provider: BinScheduleProvider): void {
  providers.set(provider.type, provider)
}

/** The provider for an external source type, or null when none is wired yet. */
export function getBinProvider(type: BinSourceType): BinScheduleProvider | null {
  if (type === 'MANUAL') return null
  return providers.get(type) ?? null
}

/**
 * Register the providers that ship with Hame. Called once at app start (and so
 * also under supertest). Idempotent — registration is a keyed Map write.
 */
export function registerBuiltInBinProviders(): void {
  registerBinProvider(icalBinProvider)
  registerBinProvider(scraperBinProvider)
  registerBinProvider(haBinProvider)
}
