import { describe, it, expect, vi, beforeEach } from 'vitest'

const sectionFindMany = vi.fn()
const getLlm = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: { section: { findMany: sectionFindMany }, item: {} },
}))
vi.mock('../services/normaliser.service.js', () => ({ getLlm }))

const { suggestSection } = await import('../services/item.service.js')

const pool = [
  { id: 'sec1', name: 'Produce', colour: null, position: 1, createdAt: new Date() },
  { id: 'sec2', name: 'Dairy', colour: '#9aa0a6', position: 5, createdAt: new Date() },
]

beforeEach(() => {
  sectionFindMany.mockReset()
  getLlm.mockReset()
  sectionFindMany.mockResolvedValue(pool)
})

describe('suggestSection', () => {
  it('resolves the chosen name back to the full section', async () => {
    getLlm.mockResolvedValue({ suggestSection: vi.fn().mockResolvedValue('Dairy') })

    const result = await suggestSection('milk')

    expect(result.source).toBe('LLM')
    expect(result.section).toEqual({
      id: 'sec2',
      name: 'Dairy',
      colour: '#9aa0a6',
      position: 5,
    })
  })

  /** Walking order, not alphabetical: it's the order the household reads its shop in. */
  it('passes the sections in walking order for the model to choose from', async () => {
    const llmSuggest = vi.fn().mockResolvedValue(null)
    getLlm.mockResolvedValue({ suggestSection: llmSuggest })

    await suggestSection('  milk  ')

    expect(llmSuggest).toHaveBeenCalledWith('milk', ['Produce', 'Dairy'])
    expect(sectionFindMany.mock.calls[0][0].orderBy).toEqual([{ position: 'asc' }, { name: 'asc' }])
  })

  it('matches the model’s answer case-insensitively', async () => {
    getLlm.mockResolvedValue({ suggestSection: vi.fn().mockResolvedValue('dairy') })
    expect((await suggestSection('milk')).section?.id).toBe('sec2')
  })

  /** No model and no sections are both "can't suggest", not "couldn't place it". */
  it('reports UNAVAILABLE with no model configured', async () => {
    getLlm.mockResolvedValue(null)
    expect(await suggestSection('milk')).toEqual({ section: null, source: 'UNAVAILABLE' })
    expect(sectionFindMany).not.toHaveBeenCalled()
  })

  it('reports UNAVAILABLE when the household has no sections yet', async () => {
    getLlm.mockResolvedValue({ suggestSection: vi.fn() })
    sectionFindMany.mockResolvedValue([])
    expect(await suggestSection('milk')).toEqual({ section: null, source: 'UNAVAILABLE' })
  })

  /** Declining is a real answer from a working model, and better than a guess. */
  it('reports LLM with no section when the model declines', async () => {
    getLlm.mockResolvedValue({ suggestSection: vi.fn().mockResolvedValue(null) })
    expect(await suggestSection('milk')).toEqual({ section: null, source: 'LLM' })
  })

  /** Belt and braces: the enum should make this impossible, so never trust it. */
  it('drops an answer that is not one of the household’s sections', async () => {
    getLlm.mockResolvedValue({ suggestSection: vi.fn().mockResolvedValue('Bakery') })
    expect(await suggestSection('bread')).toEqual({ section: null, source: 'LLM' })
  })

  /**
   * A cold Ollama loading several GB overruns the short budget these calls get.
   * Reporting that as a decline told the user the model couldn't place their item
   * when in truth it never answered — found live against a real server.
   */
  it('reports FAILED when the call never completes, not a decline', async () => {
    getLlm.mockResolvedValue({
      suggestSection: vi.fn().mockRejectedValue(new Error('The operation was aborted')),
    })
    expect(await suggestSection('milk')).toEqual({ section: null, source: 'FAILED' })
  })
})
