import { describe, it, expect, vi, beforeEach } from 'vitest'

const tagCreate = vi.fn()
const tagUpdate = vi.fn()
const tagFindUnique = vi.fn()
const tagFindMany = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    tag: { create: tagCreate, update: tagUpdate, findUnique: tagFindUnique, findMany: tagFindMany },
  },
}))

const { createTag, listTags, updateTag } = await import('../services/tag.service.js')

const row = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'chilled',
  kind: 'ITEM',
  colour: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  tagFindUnique.mockResolvedValue(null)
  tagCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(row(data)),
  )
  tagUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(row(data)),
  )
})

describe('createTag', () => {
  /** The creating surface states the kind, so nobody classifies a tag mid-flow. */
  it('files the tag under the kind the caller gives', async () => {
    const tag = await createTag({ name: 'dinner', kind: 'RECIPE' })

    expect(tagCreate).toHaveBeenCalledWith({
      data: { name: 'dinner', kind: 'RECIPE', colour: null },
    })
    expect(tag.kind).toBe('RECIPE')
  })

  /**
   * A caller that says nothing must fall to the *column's* default rather than
   * one written here, so the database stays the single answer to "what is a tag
   * with no stated kind?" — the same answer the backfill relies on (§10 Phase 24).
   */
  it('leaves the kind to the column default when unstated', async () => {
    await createTag({ name: 'organic' })

    expect(tagCreate).toHaveBeenCalledWith({ data: { name: 'organic', colour: null } })
  })
})

describe('updateTag', () => {
  beforeEach(() => {
    // Answer by what was asked for rather than by call order: `updateTag` looks
    // the tag up by id, and only looks a *name* up when one is being changed.
    tagFindUnique.mockImplementation(({ where }: { where: { id?: string } }) =>
      Promise.resolve(where.id === 't1' ? row() : null),
    )
  })

  /** A kind can be got wrong, which is the reason Settings → Tags exists. */
  it('re-files a tag under a different kind', async () => {
    const tag = await updateTag('t1', { kind: 'DIETARY' })

    expect(tagUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { kind: 'DIETARY' } })
    expect(tag.kind).toBe('DIETARY')
  })

  /** Only what was asked for changes — a rename must not re-file the tag. */
  it('leaves the kind alone when only the name changes', async () => {
    await updateTag('t1', { name: 'refrigerated' })

    expect(tagUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { name: 'refrigerated' },
    })
  })
})

describe('listTags', () => {
  /** Every surface filters on `kind`, so it has to survive the boundary. */
  it('carries the kind out to the client', async () => {
    tagFindMany.mockResolvedValue([row({ id: 't2', name: 'vegan', kind: 'DIETARY' })])

    expect(await listTags()).toEqual([{ id: 't2', name: 'vegan', kind: 'DIETARY', colour: null }])
  })
})
