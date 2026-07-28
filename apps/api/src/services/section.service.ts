import type { Section as PrismaSection } from '@prisma/client'
import type {
  CreateSectionInput,
  ReorderSectionsInput,
  Section,
  UpdateSectionInput,
} from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'

export function toSection(section: PrismaSection): Section {
  return {
    id: section.id,
    name: section.name,
    colour: section.colour,
    position: section.position,
  }
}

/**
 * Sections in walking order (spec §8.3). Name is the tie-break rather than
 * insertion order, so two sections sharing a position still list the same way
 * every time — the shopping list's grouping reads straight off this.
 */
export async function listSections(): Promise<Section[]> {
  const sections = await prisma.section.findMany({
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
  })
  return sections.map(toSection)
}

/** A new section goes to the end of the walk — the only position we can infer. */
export async function createSection(input: CreateSectionInput): Promise<Section> {
  await assertNameAvailable(input.name)
  const last = await prisma.section.findFirst({ orderBy: { position: 'desc' } })
  const section = await prisma.section.create({
    data: {
      name: input.name.trim(),
      colour: input.colour ?? null,
      position: (last?.position ?? 0) + 1,
    },
  })
  return toSection(section)
}

export async function updateSection(id: string, input: UpdateSectionInput): Promise<Section> {
  await assertExists(id)
  if (input.name !== undefined) await assertNameAvailable(input.name, id)
  const section = await prisma.section.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.colour !== undefined && { colour: input.colour }),
    },
  })
  return toSection(section)
}

/**
 * Rewrite the walking order from the given sequence. Positions are reassigned
 * from 1 in one transaction, so the list never renders mid-reorder with two
 * sections claiming the same place. Ids not listed keep their relative order
 * after the ones that are.
 */
export async function reorderSections(input: ReorderSectionsInput): Promise<Section[]> {
  const existing = await prisma.section.findMany({
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
  })
  const known = new Set(existing.map((section) => section.id))
  const missing = input.ids.find((id) => !known.has(id))
  if (missing) throw HttpError.notFound('Section not found')

  const ordered = [
    ...input.ids,
    ...existing.map((section) => section.id).filter((id) => !input.ids.includes(id)),
  ]
  await prisma.$transaction(
    ordered.map((id, index) =>
      prisma.section.update({ where: { id }, data: { position: index + 1 } }),
    ),
  )
  return listSections()
}

/**
 * Delete a section. In-use sections are deliberately *not* blocked: the FK is
 * `onDelete: SetNull` (spec §8.3), so its items fall back to the "Other" group —
 * rearranging a shop must never mean deleting the products in it.
 */
export async function deleteSection(id: string): Promise<void> {
  await assertExists(id)
  await prisma.section.delete({ where: { id } })
}

// ── internals ──────────────────────────────────────────────────────────────

async function assertExists(id: string): Promise<void> {
  const existing = await prisma.section.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Section not found')
}

async function assertNameAvailable(name: string, exceptId?: string): Promise<void> {
  const existing = await prisma.section.findFirst({
    where: { name: { equals: name.trim(), mode: 'insensitive' } },
  })
  if (existing && existing.id !== exceptId) {
    throw HttpError.conflict('A section with that name exists')
  }
}
