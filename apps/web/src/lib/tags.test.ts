import { describe, it, expect } from 'vitest'
import type { SuggestedTags, Tag } from '@hame/shared'
import {
  canCreateTag,
  filterTagPool,
  findTagByName,
  otherKindNote,
  sameTagSet,
  suggestionNote,
  tagOfAnotherKind,
  unappliedSuggestions,
} from './tags'

const dairy: Tag = { id: 't1', name: 'dairy', kind: 'ITEM', colour: '#9aa0a6' }
const chilled: Tag = { id: 't2', name: 'chilled', kind: 'ITEM', colour: '#2f6fb0' }
const dryGoods: Tag = { id: 't3', name: 'dry-goods', kind: 'ITEM', colour: '#9aa0a6' }
const pool = [dairy, chilled, dryGoods]

const dinner: Tag = { id: 't4', name: 'dinner', kind: 'RECIPE', colour: '#6f8169' }
const vegan: Tag = { id: 't5', name: 'vegan', kind: 'DIETARY', colour: '#d16a6a' }
const quickAdd: Tag = { id: 't6', name: 'quick-add', kind: 'BEHAVIOURAL', colour: '#6f8169' }
const mixedPool = [...pool, dinner, vegan, quickAdd]

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

  /**
   * Names are unique across kinds, so a name held by a recipe tag isn't free for
   * an item tag either. Offering "Create" here would produce a server conflict.
   */
  it('refuses a name already held by a tag of another kind', () => {
    expect(canCreateTag(mixedPool, 'dinner')).toBe(false)
  })
})

describe('tagOfAnotherKind', () => {
  it('names the tag blocking a query on a surface that cannot offer it', () => {
    expect(tagOfAnotherKind(mixedPool, 'ITEM', 'dinner')).toBe(dinner)
    expect(tagOfAnotherKind(mixedPool, 'RECIPE', 'chilled')).toBe(chilled)
  })

  /** Dietary is the one kind both surfaces offer, so it never clashes. */
  it('treats a dietary tag as available to both surfaces', () => {
    expect(tagOfAnotherKind(mixedPool, 'ITEM', 'vegan')).toBeUndefined()
    expect(tagOfAnotherKind(mixedPool, 'RECIPE', 'vegan')).toBeUndefined()
  })

  it('says nothing about a tag the surface does offer', () => {
    expect(tagOfAnotherKind(mixedPool, 'ITEM', 'chilled')).toBeUndefined()
  })

  it('says nothing about a name no tag holds', () => {
    expect(tagOfAnotherKind(mixedPool, 'ITEM', 'bakery')).toBeUndefined()
  })

  /** Same case-insensitivity as the rest of the pool helpers. */
  it('matches ignoring case', () => {
    expect(tagOfAnotherKind(mixedPool, 'ITEM', 'Dinner')).toBe(dinner)
  })
})

describe('otherKindNote', () => {
  it('names the kind and points at where it can be changed', () => {
    const note = otherKindNote(dinner)
    expect(note).toMatch(/recipe tag/)
    expect(note).toMatch(/Settings → Tags/)
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

  it('reports a call that never completed as still loading', () => {
    const note = suggestionNote(result({ source: 'FAILED' }), {
      poolEmpty: false,
      freshCount: 0,
    })
    expect(note).toMatch(/still be loading/)
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
