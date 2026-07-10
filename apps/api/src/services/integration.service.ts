import type {
  CreateIntegrationInput,
  Integration,
  IntegrationProviderInfo,
  IntegrationSnapshot,
  IntegrationStatus,
  IntegrationTestResult,
  TestIntegrationInput,
  UpdateIntegrationInput,
} from '@hame/shared'
import { IntegrationSnapshotSchema } from '@hame/shared'
import type { Integration as IntegrationRow, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { logger } from '../lib/logger.js'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'
import {
  getIntegrationProvider,
  listIntegrationProviders,
  toProviderInfo,
  type IntegrationContext,
  type IntegrationFetchHorizon,
  type IntegrationProvider,
} from '../integrations/providers/index.js'

/**
 * Integration framework service (spec §9.9, §10 Phase 10). CRUD over configured
 * integrations plus the poll that refreshes each one's cached data. Secrets are
 * AES-256-GCM encrypted at rest and never returned (the `hasSecret`/write-only
 * pattern from the HA/Immich config). A failed poll keeps the last good data and
 * records `lastError` — the same graceful-degrade contract as the other external
 * sources (spec §9.6).
 */

/** How far back / ahead a CALENDAR poll caches events (bounds the cache). */
const CALENDAR_LOOKBACK_DAYS = 30
const CALENDAR_LOOKAHEAD_DAYS = 365

function pollHorizon(now = new Date()): IntegrationFetchHorizon {
  const start = new Date(now)
  start.setDate(start.getDate() - CALENDAR_LOOKBACK_DAYS)
  const end = new Date(now)
  end.setDate(end.getDate() + CALENDAR_LOOKAHEAD_DAYS)
  return { start, end }
}

/** Parse a stored snapshot blob back to the public shape, or null if absent/invalid. */
function parseSnapshot(value: Prisma.JsonValue | null): IntegrationSnapshot | null {
  if (value == null) return null
  const parsed = IntegrationSnapshotSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Project a row to the public read shape — never includes the secret (spec §11). */
function toPublic(row: IntegrationRow): Integration {
  return {
    id: row.id,
    providerId: row.providerId,
    kind: row.kind,
    name: row.name,
    config: (row.config ?? {}) as Record<string, unknown>,
    hasSecret: Boolean(row.secret),
    isActive: row.isActive,
    pollIntervalSeconds: row.pollIntervalSeconds,
    snapshot: parseSnapshot(row.snapshot),
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** The registered provider for a row, or a 400 if its module is gone. */
function requireProvider(id: string): IntegrationProvider {
  const provider = getIntegrationProvider(id)
  if (!provider) throw HttpError.badRequest(`Unknown integration provider "${id}"`)
  return provider
}

/** The catalogue of registered providers, for the "add integration" picker. */
export function listProviders(): IntegrationProviderInfo[] {
  return listIntegrationProviders()
    .map(toProviderInfo)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function listIntegrations(): Promise<Integration[]> {
  const rows = await prisma.integration.findMany({ orderBy: { createdAt: 'asc' } })
  return rows.map(toPublic)
}

/**
 * Member-readable status of active STATUS integrations (the dashboard widget
 * feed). Carries only the rendered snapshot — never config or the secret — so it
 * is safe at member level, like Home Assistant's entity reads (spec §8.11).
 */
export async function listStatusIntegrations(): Promise<IntegrationStatus[]> {
  const rows = await prisma.integration.findMany({
    where: { kind: 'STATUS', isActive: true },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    providerId: row.providerId,
    snapshot: parseSnapshot(row.snapshot),
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
  }))
}

async function getRow(id: string): Promise<IntegrationRow> {
  const row = await prisma.integration.findUnique({ where: { id } })
  if (!row) throw HttpError.notFound('Integration not found')
  return row
}

export async function getIntegration(id: string): Promise<Integration> {
  return toPublic(await getRow(id))
}

export async function createIntegration(input: CreateIntegrationInput): Promise<Integration> {
  const provider = requireProvider(input.providerId)
  const row = await prisma.integration.create({
    data: {
      providerId: provider.id,
      kind: provider.kind,
      name: input.name,
      config: (input.config ?? {}) as Prisma.InputJsonValue,
      secret: input.secret !== undefined ? encryptSecret(input.secret) : null,
      isActive: input.isActive ?? true,
      ...(input.pollIntervalSeconds !== undefined && {
        pollIntervalSeconds: input.pollIntervalSeconds,
      }),
    },
  })
  // Populate the cache immediately so the dashboard/calendar isn't blank until the
  // next scheduled poll (best-effort; a failure just records lastError).
  if (row.isActive) await pollIntegration(row.id).catch(() => undefined)
  return getIntegration(row.id)
}

export async function updateIntegration(
  id: string,
  input: UpdateIntegrationInput,
): Promise<Integration> {
  await getRow(id) // 404 if missing
  const encryptedSecret = input.secret !== undefined ? encryptSecret(input.secret) : undefined
  const row = await prisma.integration.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.config !== undefined && { config: input.config as Prisma.InputJsonValue }),
      ...(encryptedSecret !== undefined && { secret: encryptedSecret }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.pollIntervalSeconds !== undefined && {
        pollIntervalSeconds: input.pollIntervalSeconds,
      }),
    },
  })
  if (row.isActive) await pollIntegration(row.id).catch(() => undefined)
  return getIntegration(row.id)
}

export async function deleteIntegration(id: string): Promise<void> {
  await getRow(id) // 404 if missing
  // IntegrationEvent rows cascade on the FK (onDelete: Cascade).
  await prisma.integration.delete({ where: { id } })
}

/** Decrypt a row's secret for handing to its provider. */
function contextFor(row: Pick<IntegrationRow, 'config' | 'secret'>): IntegrationContext {
  return {
    config: (row.config ?? {}) as Record<string, unknown>,
    secret: row.secret ? decryptSecret(row.secret) : null,
  }
}

/**
 * Probe an unsaved provider + config + secret (Settings "Test connection"). Never
 * throws — a bad config or unreachable host comes back as `{ ok: false }`, the
 * same graceful-degrade contract as the HA/Ollama probes.
 */
export async function testIntegration(input: TestIntegrationInput): Promise<IntegrationTestResult> {
  const provider = getIntegrationProvider(input.providerId)
  if (!provider) return { ok: false, message: `Unknown provider "${input.providerId}"` }
  try {
    await provider.test({ config: input.config, secret: input.secret ?? null })
    return { ok: true, message: 'Connected.' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Connection failed.' }
  }
}

/**
 * Refresh one integration's cached data. STATUS writes a fresh snapshot; CALENDAR
 * replaces its cached events wholesale (the SyncedEvent/BinOccurrence mould, so a
 * removed milestone disappears). A failure records `lastError` and leaves the last
 * good data in place. Returns the updated public integration.
 */
export async function pollIntegration(id: string): Promise<Integration> {
  const row = await getRow(id)
  const provider = getIntegrationProvider(row.providerId)
  if (!provider) {
    await prisma.integration.update({
      where: { id },
      data: { lastError: `Provider "${row.providerId}" is no longer available` },
    })
    return getIntegration(id)
  }

  const ctx = contextFor(row)
  try {
    if (provider.kind === 'STATUS') {
      const snapshot = await provider.fetchSnapshot(ctx)
      await prisma.integration.update({
        where: { id },
        data: {
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          lastSyncedAt: new Date(),
          lastError: null,
        },
      })
    } else {
      const events = await provider.fetchEvents(ctx, pollHorizon())
      await prisma.$transaction([
        prisma.integrationEvent.deleteMany({ where: { integrationId: id } }),
        prisma.integrationEvent.createMany({
          data: events.map((e) => ({
            integrationId: id,
            externalId: e.externalId,
            title: e.title,
            startTime: e.startTime,
            endTime: e.endTime ?? null,
            allDay: e.allDay ?? false,
          })),
        }),
        prisma.integration.update({
          where: { id },
          data: { lastSyncedAt: new Date(), lastError: null },
        }),
      ])
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Poll failed'
    logger.warn({ err, integrationId: id, providerId: row.providerId }, 'Integration poll failed')
    await prisma.integration.update({ where: { id }, data: { lastError: message } })
  }
  return getIntegration(id)
}

/**
 * Poll every active integration (the scheduled job). Each is isolated — one
 * failure never aborts the rest.
 */
export async function pollAllActiveIntegrations(): Promise<void> {
  const rows = await prisma.integration.findMany({
    where: { isActive: true },
    select: { id: true },
  })
  for (const { id } of rows) {
    await pollIntegration(id).catch((err) =>
      logger.error({ err, integrationId: id }, 'Integration poll threw'),
    )
  }
}
