import { describe, it, expect } from 'vitest'
import type { SuggestedTags, Tag } from '@hame/shared'
import {
  canCreateTag,
  filterTagPool,
  findTagByName,
  sameTagSet,
  suggestionNote,
  unappliedSuggestions,
} from './item-tags'

const dairy: Tag = { id: 't1', name: 'dairy', colour: '#9aa0a6' }
const chilled: Tag = { id: 't2', name: 'chilled', colour: '#2f6fb0' }
const dryGoods: Tag = { id: 't3', name: 'dry-goods', colour: '#9aa0a6' }
const pool = [dairy, chilled, dryGoods]

const result = (over: Partial<SuggestedTags> = {}): SuggestedTags => ({
  tags: over.tags ?? [],
  source: over.source ?? 'LLM',
})

describe('findTagByName', () => {
  it('matches ignoring case and surrounding space', () => {
    expect(findTagByName(pool, '  Dairy ')).toBe(dairy)
  })

  it('does not match a partial name', () => {
    expect(findTagByName(pool, 'dair')).toBeUndefined()
  })

  it('treats a blank query as no match', () => {
    expect(findTagByName(pool, '   ')).toBeUndefined()
  })
})

describe('filterTagPool', () => {
  it('offers only pool tags matching the query', () => {
    expect(filterTagPool(pool, [], 'dai')).toEqual([dairy])
  })

  /** Anywhere in the name, so "goods" is findable without typing "dry-" first. */
  it('matches on a substring, not just a prefix', () => {
    expect(filterTagPool(pool, [], 'good')).toEqual([dryGoods])
  })

  it('lists the whole remaining pool for an empty query, so it can be browsed', () => {
    expect(filterTagPool(pool, [], '')).toEqual(pool)
  })

  /** An applied tag in the dropdown is a dead option. */
  it('excludes tags already on the item', () => {
    // Every tag here happens to contain a "d", so only the applied one drops out.
    expect(filterTagPool(pool, [dairy], 'd')).toEqual([chilled, dryGoods])
  })
})

describe('canCreateTag', () => {
  it('offers creation for a name the pool does not have', () => {
    expect(canCreateTag(pool, 'bakery')).toBe(true)
  })

  /** The whole point of the enum-constrained pool: no near-duplicate tags. */
  it('refuses to offer a case variant of an existing tag', () => {
    expect(canCreateTag(pool, 'Dairy')).toBe(false)
  })

  it('offers nothing for a blank query', () => {
    expect(canCreateTag(pool, '  ')).toBe(false)
  })
})

describe('unappliedSuggestions', () => {
  it('drops suggestions the item already carries', () => {
    expect(unappliedSuggestions([dairy, chilled], [dairy])).toEqual([chilled])
  })
})

describe('suggestionNote', () => {
  it('says nothing when there are fresh chips to show', () => {
    expect(
      suggestionNote(result({ tags: [dairy] }), { poolEmpty: false, freshCount: 1 }),
    ).toBeNull()
  })

  /** UNAVAILABLE covers two situations; the client separates them by the pool. */
  it('points at settings when a model is missing but tags exist', () => {
    const note = suggestionNote(result({ source: 'UNAVAILABLE' }), {
      poolEmpty: false,
      freshCount: 0,
    })
    expect(note).toMatch(/No language model configured/)
  })

  it('points at making a tag when the pool is empty', () => {
    const note = suggestionNote(result({ source: 'UNAVAILABLE' }), {
      poolEmpty: true,
      freshCount: 0,
    })
    expect(note).toMatch(/No tags to choose from/)
  })

  it('distinguishes a model that had no ideas from a missing model', () => {
    const note = suggestionNote(result({ source: 'LLM' }), { poolEmpty: false, freshCount: 0 })
    expect(note).toBe('The model had no suggestions for that name.')
  })

  it('explains an answer that was entirely tags already applied', () => {
    const note = suggestionNote(result({ tags: [dairy], source: 'LLM' }), {
      poolEmpty: false,
      freshCount: 0,
    })
    expect(note).toBe('Those tags are already on this item.')
  })
})

describe('sameTagSet', () => {
  it('ignores order', () => {
    expect(sameTagSet([dairy, chilled], [chilled, dairy])).toBe(true)
  })

  it('spots a different set of the same size', () => {
    expect(sameTagSet([dairy, chilled], [dairy, dryGoods])).toBe(false)
  })

  it('spots a different length', () => {
    expect(sameTagSet([dairy], [dairy, chilled])).toBe(false)
  })
})
