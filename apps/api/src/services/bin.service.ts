import type { BinCollection as PrismaBin } from '@prisma/client'
import type { BinCollection, CreateBinInput, UpdateBinInput } from '@hame/shared'
import { type BinScheduleRule, nextBinCollection } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'

/** Bins never use ONE_OFF (Zod enforces this on write); narrow for the engine. */
function scheduleRule(bin: PrismaBin): BinScheduleRule | null {
  if (bin.recurrenceType === 'ONE_OFF') return null
  return {
    recurrenceType: bin.recurrenceType,
    intervalDays: bin.intervalDays,
    weekdays: bin.weekdays,
    dayOfMonth: bin.dayOfMonth,
    startDate: bin.startDate,
  }
}

export function toBinCollection(bin: PrismaBin): BinCollection {
  const rule = scheduleRule(bin)
  return {
    id: bin.id,
    name: bin.name,
    colour: bin.colour,
    icon: bin.icon,
    recurrenceType: bin.recurrenceType as BinCollection['recurrenceType'],
    intervalDays: bin.intervalDays,
    weekdays: bin.weekdays,
    dayOfMonth: bin.dayOfMonth,
    startDate: bin.startDate,
    remindNightBefore: bin.remindNightBefore,
    remindMorningOf: bin.remindMorningOf,
    isActive: bin.isActive,
    nextCollection: rule ? nextBinCollection(rule) : null,
    createdAt: bin.createdAt,
    updatedAt: bin.updatedAt,
  }
}

export async function listBins(opts: { active?: boolean } = {}): Promise<BinCollection[]> {
  const bins = await prisma.binCollection.findMany({
    where: opts.active === undefined ? {} : { isActive: opts.active },
    orderBy: { name: 'asc' },
  })
  return bins.map(toBinCollection)
}

export async function getBin(id: string): Promise<BinCollection> {
  const bin = await prisma.binCollection.findUnique({ where: { id } })
  if (!bin) throw HttpError.notFound('Bin not found')
  return toBinCollection(bin)
}

export async function createBin(input: CreateBinInput): Promise<BinCollection> {
  const bin = await prisma.binCollection.create({
    data: {
      name: input.name,
      colour: input.colour,
      icon: input.icon ?? null,
      recurrenceType: input.recurrenceType,
      intervalDays: input.intervalDays ?? null,
      weekdays: input.weekdays ?? [],
      dayOfMonth: input.dayOfMonth ?? null,
      startDate: input.startDate ?? null,
      ...(input.remindNightBefore !== undefined && { remindNightBefore: input.remindNightBefore }),
      ...(input.remindMorningOf !== undefined && { remindMorningOf: input.remindMorningOf }),
    },
  })
  return toBinCollection(bin)
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
  return toBinCollection(bin)
}

export async function deleteBin(id: string): Promise<void> {
  const existing = await prisma.binCollection.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Bin not found')
  await prisma.binCollection.delete({ where: { id } })
}
