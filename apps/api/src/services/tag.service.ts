import type { Tag as PrismaTag } from '@prisma/client'
import type { CreateTagInput, Tag, UpdateTagInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'

export function toTag(tag: PrismaTag): Tag {
  return { id: tag.id, name: tag.name, kind: tag.kind, colour: tag.colour }
}

export async function listTags(): Promise<Tag[]> {
  const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } })
  return tags.map(toTag)
}

/**
 * Create a tag. `kind` is the creating surface's to state (§10 Phase 24) — the
 * item editor makes item vocabulary, the recipe form makes recipe vocabulary —
 * and a caller that says nothing gets `ITEM`, the column's default.
 */
export async function createTag(input: CreateTagInput): Promise<Tag> {
  await assertNameAvailable(input.name)
  const tag = await prisma.tag.create({
    data: {
      name: input.name,
      ...(input.kind !== undefined && { kind: input.kind }),
      colour: input.colour ?? null,
    },
  })
  return toTag(tag)
}

export async function updateTag(id: string, input: UpdateTagInput): Promise<Tag> {
  await assertExists(id)
  if (input.name !== undefined) await assertNameAvailable(input.name, id)
  const tag = await prisma.tag.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.colour !== undefined && { colour: input.colour }),
    },
  })
  return toTag(tag)
}

export async function deleteTag(id: string): Promise<void> {
  await assertExists(id)
  // Tags are a many-to-many label; deleting just detaches them from items.
  await prisma.tag.delete({ where: { id } })
}

// ── internals ──────────────────────────────────────────────────────────────

async function assertExists(id: string): Promise<void> {
  const existing = await prisma.tag.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Tag not found')
}

async function assertNameAvailable(name: string, exceptId?: string): Promise<void> {
  const existing = await prisma.tag.findUnique({ where: { name } })
  if (existing && existing.id !== exceptId) throw HttpError.conflict('That tag already exists')
}
