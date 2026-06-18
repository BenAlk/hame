import type { StorageLocation as PrismaLocation } from '@prisma/client'
import type {
  CreateStorageLocationInput,
  StorageLocation,
  UpdateStorageLocationInput,
} from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'

export function toStorageLocation(loc: PrismaLocation): StorageLocation {
  return { id: loc.id, name: loc.name, icon: loc.icon }
}

export async function listStorageLocations(): Promise<StorageLocation[]> {
  const locations = await prisma.storageLocation.findMany({ orderBy: { name: 'asc' } })
  return locations.map(toStorageLocation)
}

export async function createStorageLocation(
  input: CreateStorageLocationInput,
): Promise<StorageLocation> {
  await assertNameAvailable(input.name)
  const loc = await prisma.storageLocation.create({
    data: { name: input.name, icon: input.icon ?? null },
  })
  return toStorageLocation(loc)
}

export async function updateStorageLocation(
  id: string,
  input: UpdateStorageLocationInput,
): Promise<StorageLocation> {
  await assertExists(id)
  if (input.name !== undefined) await assertNameAvailable(input.name, id)
  const loc = await prisma.storageLocation.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.icon !== undefined && { icon: input.icon }),
    },
  })
  return toStorageLocation(loc)
}

export async function deleteStorageLocation(id: string): Promise<void> {
  const loc = await prisma.storageLocation.findUnique({
    where: { id },
    include: { _count: { select: { pantryItems: true } } },
  })
  if (!loc) throw HttpError.notFound('Storage location not found')
  if (loc._count.pantryItems > 0) {
    throw HttpError.conflict('This location still holds pantry items')
  }
  await prisma.storageLocation.delete({ where: { id } })
}

// ── internals ──────────────────────────────────────────────────────────────

async function assertExists(id: string): Promise<void> {
  const existing = await prisma.storageLocation.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Storage location not found')
}

async function assertNameAvailable(name: string, exceptId?: string): Promise<void> {
  const existing = await prisma.storageLocation.findUnique({ where: { name } })
  if (existing && existing.id !== exceptId) {
    throw HttpError.conflict('A location with that name exists')
  }
}
