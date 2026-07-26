import type { Shop as PrismaShop } from '@prisma/client'
import type { CreateShopInput, Shop, UpdateShopInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'

export function toShop(shop: PrismaShop): Shop {
  return { id: shop.id, name: shop.name, colour: shop.colour }
}

export async function listShops(): Promise<Shop[]> {
  const shops = await prisma.shop.findMany({ orderBy: { name: 'asc' } })
  return shops.map(toShop)
}

export async function createShop(input: CreateShopInput): Promise<Shop> {
  await assertNameAvailable(input.name)
  const shop = await prisma.shop.create({
    data: { name: input.name.trim(), colour: input.colour ?? null },
  })
  return toShop(shop)
}

export async function updateShop(id: string, input: UpdateShopInput): Promise<Shop> {
  await assertExists(id)
  if (input.name !== undefined) await assertNameAvailable(input.name, id)
  const shop = await prisma.shop.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.colour !== undefined && { colour: input.colour }),
    },
  })
  return toShop(shop)
}

/**
 * Delete a shop. Unlike storage locations, in-use shops are *not* blocked: the
 * FK is `onDelete: SetNull` (spec §8.3), so items simply fall back to generic —
 * "we stopped shopping at Lidl" must never mean "delete the products".
 */
export async function deleteShop(id: string): Promise<void> {
  await assertExists(id)
  await prisma.shop.delete({ where: { id } })
}

// ── internals ──────────────────────────────────────────────────────────────

async function assertExists(id: string): Promise<void> {
  const existing = await prisma.shop.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Shop not found')
}

async function assertNameAvailable(name: string, exceptId?: string): Promise<void> {
  const existing = await prisma.shop.findFirst({
    where: { name: { equals: name.trim(), mode: 'insensitive' } },
  })
  if (existing && existing.id !== exceptId) {
    throw HttpError.conflict('A shop with that name exists')
  }
}
