import { describe, it, expect, vi, beforeEach } from 'vitest'

const tagFindMany = vi.fn()
const getLlm = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: { tag: { findMany: tagFindMany }, item: {} },
}))
vi.mock('../services/normaliser.service.js', () => ({ getLlm }))

const { suggestTags } = await import('../services/item.service.js')

const pool = [
  { id: 't1', name: 'baking', colour: null },
  { id: 't2', name: 'dairy', colour: '#fff' },
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
    expect(result.tags).toEqual([{ id: 't2', name: 'dairy', colour: '#fff' }])
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

  it('reports UNAVAILABLE when the household has no tags yet', async () => {
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
   * Dietary tags are a claim about what a product contains, readable only off a
   * packet. Left in the pool this was not hypothetical: with no `dairy` tag left
   * after Phase 18, a real model suggested `dairy-free` for Cheddar cheese.
   */
  it('withholds dietary tags from the model entirely', async () => {
    const llmSuggest = vi.fn().mockResolvedValue([])
    getLlm.mockResolvedValue({ suggestTags: llmSuggest })
    tagFindMany.mockResolvedValue([
      { id: 't1', name: 'chilled', colour: null },
      { id: 't2', name: 'dairy-free', colour: null },
      { id: 't3', name: 'Vegan', colour: null },
      { id: 't4', name: 'gluten-free', colour: null },
      { id: 't5', name: 'healthy', colour: null },
    ])

    await suggestTags('cheddar cheese')

    expect(llmSuggest).toHaveBeenCalledWith('cheddar cheese', ['chilled'])
  })

  /** Withholding is case-insensitive, so a re-cased duplicate can't slip through. */
  it('cannot return a dietary tag even if the model names one', async () => {
    getLlm.mockResolvedValue({ suggestTags: vi.fn().mockResolvedValue(['dairy-free']) })
    tagFindMany.mockResolvedValue([
      { id: 't1', name: 'chilled', colour: null },
      { id: 't2', name: 'Dairy-Free', colour: null },
    ])

    expect(await suggestTags('cheddar cheese')).toEqual({ tags: [], source: 'LLM' })
  })

  /** A pool that is nothing but dietary tags leaves the model nothing to pick. */
  it('reports UNAVAILABLE when withholding empties the pool', async () => {
    getLlm.mockResolvedValue({ suggestTags: vi.fn() })
    tagFindMany.mockResolvedValue([{ id: 't1', name: 'vegan', colour: null }])
    expect(await suggestTags('tofu')).toEqual({ tags: [], source: 'UNAVAILABLE' })
  })
})
