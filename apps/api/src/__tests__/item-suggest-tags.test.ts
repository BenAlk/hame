import { describe, it, expect, vi, beforeEach } from 'vitest'

const tagFindMany = vi.fn()
const getLlm = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: { tag: { findMany: tagFindMany }, item: {} },
}))
vi.mock('../services/normaliser.service.js', () => ({ getLlm }))

const { suggestTags } = await import('../services/item.service.js')

const pool = [
  { id: 't1', name: 'baking', kind: 'ITEM', colour: null },
  { id: 't2', name: 'dairy', kind: 'ITEM', colour: '#fff' },
]

beforeEach(() => {
  tagFindMany.mockReset()
  getLlm.mockReset()
  tagFindMany.mockResolvedValue(pool)
})

describe('suggestTags', () => {
  it('resolves the chosen names back to full tags', async () => {
    getLlm.mockResolvedValue({ suggestTags: vi.fn().mockResolvedValue(['dairy']) })

    const result = await suggestTags('milk')

    expect(result.source).toBe('LLM')
    expect(result.tags).toEqual([{ id: 't2', name: 'dairy', kind: 'ITEM', colour: '#fff' }])
  })

  it('passes the existing pool to the model, so it can only choose from it', async () => {
    const llmSuggest = vi.fn().mockResolvedValue([])
    getLlm.mockResolvedValue({ suggestTags: llmSuggest })

    await suggestTags('  milk  ')

    expect(llmSuggest).toHaveBeenCalledWith('milk', ['baking', 'dairy'])
  })

  /** No model and no tags are both "can't suggest", not "nothing applies". */
  it('reports UNAVAILABLE with no model configured', async () => {
    getLlm.mockResolvedValue(null)
    expect(await suggestTags('milk')).toEqual({ tags: [], source: 'UNAVAILABLE' })
    expect(tagFindMany).not.toHaveBeenCalled()
  })

  /** Since Phase 24 an empty pool means no tag of a *suggestible* kind. */
  it('reports UNAVAILABLE when the household has no suggestible tags', async () => {
    getLlm.mockResolvedValue({ suggestTags: vi.fn() })
    tagFindMany.mockResolvedValue([])
    expect(await suggestTags('milk')).toEqual({ tags: [], source: 'UNAVAILABLE' })
  })

  /** An empty answer from a working model is a real answer: nothing applies. */
  it('reports LLM with no tags when the model chooses none', async () => {
    getLlm.mockResolvedValue({ suggestTags: vi.fn().mockResolvedValue([]) })
    expect(await suggestTags('milk')).toEqual({ tags: [], source: 'LLM' })
  })

  /** Same distinction as sections: a call that never completed is not an answer. */
  it('reports FAILED when the call never completes', async () => {
    getLlm.mockResolvedValue({
      suggestTags: vi.fn().mockRejectedValue(new Error('The operation was aborted')),
    })
    expect(await suggestTags('milk')).toEqual({ tags: [], source: 'FAILED' })
  })

  /**
   * The heart of Phase 24: the model is handed the tags of the one kind that
   * describes a product, as a query rather than a subtraction. Dietary claims,
   * recipe words and `quick-add` are excluded by never being fetched — the
   * by-name withholding this replaced had to anticipate each wrong answer, and
   * duly missed a household's own "lactose-free".
   */
  it('asks the database only for suggestible kinds', async () => {
    getLlm.mockResolvedValue({ suggestTags: vi.fn().mockResolvedValue([]) })

    await suggestTags('cheddar cheese')

    expect(tagFindMany).toHaveBeenCalledWith({
      where: { kind: { in: ['ITEM'] } },
      orderBy: { name: 'asc' },
    })
  })

  /**
   * Belt and braces on top of the grammar: the reply is resolved against the pool
   * that was sent, so a name from outside it — a dietary tag the model somehow
   * produced — resolves to nothing rather than being trusted.
   */
  it('drops a chosen name that was not in the pool it sent', async () => {
    getLlm.mockResolvedValue({ suggestTags: vi.fn().mockResolvedValue(['dairy-free']) })
    tagFindMany.mockResolvedValue([{ id: 't1', name: 'chilled', kind: 'ITEM', colour: null }])

    expect(await suggestTags('cheddar cheese')).toEqual({ tags: [], source: 'LLM' })
  })
})
