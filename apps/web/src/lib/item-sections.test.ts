import { describe, it, expect } from 'vitest'
import type { Section, SuggestedSection } from '@hame/shared'
import { sectionSuggestionNote } from './item-sections'

const dairy: Section = { id: 'sec2', name: 'Dairy', colour: null, position: 5 }

const result = (over: Partial<SuggestedSection> = {}): SuggestedSection => ({
  section: over.section ?? null,
  source: over.source ?? 'LLM',
})

describe('sectionSuggestionNote', () => {
  it('says nothing when there is a chip worth offering', () => {
    const note = sectionSuggestionNote(result({ section: dairy }), {
      poolEmpty: false,
      currentSectionId: null,
    })
    expect(note).toBeNull()
  })

  /** Offering a chip that changes nothing is worse than saying so. */
  it('says so when the suggestion is already the item’s section', () => {
    const note = sectionSuggestionNote(result({ section: dairy }), {
      poolEmpty: false,
      currentSectionId: 'sec2',
    })
    expect(note).toMatch(/already/i)
  })

  it('still offers a suggestion that differs from the current section', () => {
    const note = sectionSuggestionNote(result({ section: dairy }), {
      poolEmpty: false,
      currentSectionId: 'sec1',
    })
    expect(note).toBeNull()
  })

  /** UNAVAILABLE covers two situations; the pool tells them apart. */
  it('points at settings when a model is missing but sections exist', () => {
    const note = sectionSuggestionNote(result({ source: 'UNAVAILABLE' }), {
      poolEmpty: false,
      currentSectionId: null,
    })
    expect(note).toMatch(/No language model configured/)
  })

  it('points at making a section when there are none', () => {
    const note = sectionSuggestionNote(result({ source: 'UNAVAILABLE' }), {
      poolEmpty: true,
      currentSectionId: null,
    })
    expect(note).toMatch(/No sections yet/)
  })

  /** The live-found bug: a timed-out call was reported as a decline. */
  it('reports a call that never completed as still loading, not a decline', () => {
    const note = sectionSuggestionNote(result({ source: 'FAILED' }), {
      poolEmpty: false,
      currentSectionId: null,
    })
    expect(note).toMatch(/still be loading/)
    expect(note).not.toMatch(/couldn’t place/)
  })

  /** A model that declined is not a model that is missing. */
  it('distinguishes a model that could not place the item', () => {
    const note = sectionSuggestionNote(result({ source: 'LLM' }), {
      poolEmpty: false,
      currentSectionId: null,
    })
    expect(note).toMatch(/couldn’t place/)
  })
})
