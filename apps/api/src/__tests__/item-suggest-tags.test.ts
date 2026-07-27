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
})
