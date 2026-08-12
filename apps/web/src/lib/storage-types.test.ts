import { describe, it, expect } from 'vitest'
import type { SuggestedStorageType } from '@hame/shared'
import { storageSuggestionNote } from './storage-types'

const result = (over: Partial<SuggestedStorageType> = {}): SuggestedStorageType => ({
  storageType: over.storageType ?? null,
  source: over.source ?? 'LLM',
})

describe('storageSuggestionNote', () => {
  it('says nothing when there is a chip worth offering', () => {
    expect(storageSuggestionNote(result({ storageType: 'CHILLED' }), { current: null })).toBeNull()
  })

  /** A chip that changes nothing is a no-op; report it instead of offering it. */
  it('reports a suggestion matching what is already set', () => {
    const note = storageSuggestionNote(result({ storageType: 'CHILLED' }), { current: 'CHILLED' })
    expect(note).toBe('That’s already set to chilled.')
  })

  it('offers a chip when the suggestion would change the answer', () => {
    expect(
      storageSuggestionNote(result({ storageType: 'CHILLED' }), { current: 'AMBIENT' }),
    ).toBeNull()
  })

  /**
   * The one place this differs from its section sibling: the choices are a
   * project constant, so there is no empty pool and UNAVAILABLE has one meaning.
   */
  it('sends someone to settings when no model is configured', () => {
    const note = storageSuggestionNote(result({ source: 'UNAVAILABLE' }), { current: null })
    expect(note).toMatch(/No language model configured/)
  })

  it('reports a call that never completed as still loading', () => {
    const note = storageSuggestionNote(result({ source: 'FAILED' }), { current: null })
    expect(note).toMatch(/still be loading/)
  })

  /** Distinct from the above: the model answered, and its answer was "I can't say". */
  it('distinguishes a genuine decline from a failure', () => {
    const note = storageSuggestionNote(result({ source: 'LLM' }), { current: null })
    expect(note).toBe('The model couldn’t say how that one is kept. Pick it yourself.')
  })
})
