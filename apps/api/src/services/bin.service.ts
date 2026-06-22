import type { BinCollection as PrismaBin, BinOccurrence, Prisma } from '@prisma/client'
import { Prisma as PrismaNS } from '@prisma/client'
import type {
  BinCollection,
  BinSourceConfig,
  BinSyncResult,
  CreateBinInput,
  UpdateBinInput,
} from '@hame/shared'
import { type BinScheduleRule, nextBinCollection } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { logger } from '../lib/logger.js'
import { getBinProvider } from '../integrations/bin-sources/index.js'

/** How far ahead an external sync fetches and caches collection dates. */
const SYNC_HORIZON_DAYS = 366

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Only a MANUAL bin with a real recurrence drives the date engine. */
function scheduleRule(bin: PrismaBin): BinScheduleRule | null {
  if (bin.sourceType !== 'MANUAL') return null
  if (!bin.recurrenceType || bin.recurrenceType === 'ONE_OFF') return null
  return {
    recurrenceType: bin.recurrenceType,
    intervalDays: bin.intervalDays,
    weekdays: bin.weekdays,
    dayOfMonth: bin.dayOfMonth,
    startDate: bin.startDate,
  }
}

/**
 * Next collection on or after today: MANUAL bins compute it from the schedule;
 * external bins read the soonest cached occurrence (null until first synced).
 */
function computeNextCollection(bin: PrismaBin, occurrences: BinOccurrence[]): Date | null {
  if (bin.sourceType === 'MANUAL') {
    const rule = scheduleRule(bin)
    return rule ? nextBinCollection(rule) : null
  }
  const today = startOfToday()
  const upcoming = occurrences
    .map((o) => o.date)
    .filter((d) => d >= today)
    .sort((a, b) => a.getTime() - b.getTime())
  return upcoming[0] ?? null
}

export function toBinCollection(bin: PrismaBin, occurrences: BinOccurrence[] = []): BinCollection {
  return {
    id: bin.id,
    name: bin.name,
    colour: bin.colour,
    icon: bin.icon,
    sourceType: bin.sourceType,
    sourceConfig: (bin.sourceConfig as BinSourceConfig | null) ?? null,
    recurrenceType: bin.recurrenceType as BinCollection['recurrenceType'],
    intervalDays: bin.intervalDays,
    weekdays: bin.weekdays,
    dayOfMonth: bin.dayOfMonth,
    startDate: bin.startDate,
    remindNightBefore: bin.remindNightBefore,
    remindMorningOf: bin.remindMorningOf,
    isActive: bin.isActive,
    nextCollection: computeNextCollection(bin, occurrences),
    lastSyncedAt: bin.lastSyncedAt,
    createdAt: bin.createdAt,
    updatedAt: bin.updatedAt,
  }
}

/** Prisma's nullable-Json write value for a (possibly absent) source config. */
function configWrite(
  config: BinSourceConfig | null | undefined,
): Prisma.InputJsonValue | typeof PrismaNS.DbNull {
  return config ? (config as Prisma.InputJsonValue) : PrismaNS.DbNull
}

export async function listBins(opts: { active?: boolean } = {}): Promise<BinCollection[]> {
  const bins = await prisma.binCollection.findMany({
    where: opts.active === undefined ? {} : { isActive: opts.active },
    orderBy: { name: 'asc' },
    include: { occurrences: true },
  })
  return bins.map((bin) => toBinCollection(bin, bin.occurrences))
}

export async function getBin(id: string): Promise<BinCollection> {
  const bin = await prisma.binCollection.findUnique({
    where: { id },
    include: { occurrences: true },
  })
  if (!bin) throw HttpError.notFound('Bin not found')
  return toBinCollection(bin, bin.occurrences)
}

export async function createBin(input: CreateBinInput): Promise<BinCollection> {
  const sourceType = input.sourceType ?? 'MANUAL'
  const bin = await prisma.binCollection.create({
    data: {
      name: input.name,
      colour: input.colour,
      icon: input.icon ?? null,
      sourceType,
      sourceConfig: configWrite(input.sourceConfig),
      recurrenceType: input.recurrenceType ?? null,
      intervalDays: input.intervalDays ?? null,
      weekdays: input.weekdays ?? [],
      dayOfMonth: input.dayOfMonth ?? null,
      startDate: input.startDate ?? null,
      ...(input.remindNightBefore !== undefined && { remindNightBefore: input.remindNightBefore }),
      ...(input.remindMorningOf !== undefined && { remindMorningOf: input.remindMorningOf }),
    },
  })
  // Populate an external bin immediately; failures don't block creation (the
  // cache fills on the next scheduled sync). MANUAL bins need no sync.
  if (sourceType !== 'MANUAL') {
    await syncBin(bin.id).catch((err) =>
      logger.warn({ err, binId: bin.id }, 'Initial bin sync failed'),
    )
  }
  return getBin(bin.id)
}

export async function updateBin(id: string, input: UpdateBinInput): Promise<BinCollection> {
  const existing = await prisma.binCollection.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Bin not found')
  const bin = await prisma.binCollection.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.colour !== undefined && { colour: input.colour }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.sourceType !== undefined && { sourceType: input.sourceType }),
      ...(input.sourceConfig !== undefined && { sourceConfig: configWrite(input.sourceConfig) }),
      ...(input.recurrenceType !== undefined && { recurrenceType: input.recurrenceType }),
      ...(input.intervalDays !== undefined && { intervalDays: input.intervalDays }),
      ...(input.weekdays !== undefined && { weekdays: input.weekdays }),
      ...(input.dayOfMonth !== undefined && { dayOfMonth: input.dayOfMonth }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.remindNightBefore !== undefined && { remindNightBefore: input.remindNightBefore }),
      ...(input.remindMorningOf !== undefined && { remindMorningOf: input.remindMorningOf }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  })
  return getBin(bin.id)
}

export async function deleteBin(id: string): Promise<void> {
  const existing = await prisma.binCollection.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Bin not found')
  await prisma.binCollection.delete({ where: { id } }) // occurrences cascade
}

/**
 * Refresh an external bin's cached collection dates from its source, replacing
 * the cache wholesale (a derived cache, so delete-then-insert is the simplest
 * correct strategy — and how iCal calendar sync works, spec §8.10). A failed
 * fetch leaves the existing cache intact and reports a warning. MANUAL bins have
 * nothing to sync; unwired external providers degrade gracefully.
 */
export async function syncBin(id: string): Promise<BinSyncResult> {
  const bin = await prisma.binCollection.findUnique({ where: { id } })
  if (!bin) throw HttpError.notFound('Bin not found')
  if (bin.sourceType === 'MANUAL') {
    return { ok: true, count: 0, message: 'Manual bins are computed from their schedule.' }
  }

  const provider = getBinProvider(bin.sourceType)
  if (!provider) {
    return {
      ok: false,
      count: 0,
      message: `${bin.sourceType} bin sources are not available yet.`,
    }
  }

  const start = startOfToday()
  const end = new Date(start.getTime() + SYNC_HORIZON_DAYS * 86_400_000)
  let occurrences
  try {
    occurrences = await provider.fetchOccurrences(
      (bin.sourceConfig as BinSourceConfig | null) ?? {},
      {
        start,
        end,
      },
    )
  } catch (err) {
    logger.warn({ err, binId: id }, 'Bin sync fetch failed')
    return {
      ok: false,
      count: 0,
      message: `Could not fetch the bin schedule (${err instanceof Error ? err.message : 'unknown error'}).`,
    }
  }

  await prisma.$transaction([
    prisma.binOccurrence.deleteMany({ where: { binId: id } }),
    prisma.binOccurrence.createMany({
      data: occurrences.map((o) => ({ binId: id, date: o.date })),
      skipDuplicates: true, // a source can repeat a date; keep the first
    }),
    prisma.binCollection.update({ where: { id }, data: { lastSyncedAt: new Date() } }),
  ])

  return {
    ok: true,
    count: occurrences.length,
    message: `Synced ${occurrences.length} collections.`,
  }
}

/** Sync every active external bin — the cron entry point. Never throws. */
export async function syncAllActiveBins(): Promise<void> {
  const bins = await prisma.binCollection.findMany({
    where: { isActive: true, sourceType: { not: 'MANUAL' } },
    select: { id: true, name: true },
  })
  for (const bin of bins) {
    const result = await syncBin(bin.id).catch((err) => {
      logger.warn({ err, binId: bin.id }, 'Scheduled bin sync failed')
      return null
    })
    if (result?.ok) logger.info({ bin: bin.name, count: result.count }, 'Bin synced')
  }
}
