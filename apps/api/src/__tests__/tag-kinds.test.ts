import { describe, it, expect } from 'vitest'
import type { Tag, TagKind } from '@hame/shared'
import {
  SUGGESTIBLE_TAG_KINDS,
  TAG_KINDS,
  TAG_KINDS_BY_SURFACE,
  TAG_KIND_LABELS,
  defaultTagKindFor,
  isTagKindOffered,
  mayModelSuggestTagKind,
  tagsForSurface,
} from '@hame/shared'

/** Pure kind rules (spec §10 Phase 24) — what a tag is for, in one place. */

const tag = (name: string, kind: TagKind): Tag => ({ id: name, name, kind, colour: null })

describe('what each surface offers', () => {
  it('offers an item its own vocabulary, dietary claims and quick-add', () => {
    expect(TAG_KINDS_BY_SURFACE.ITEM).toEqual(['ITEM', 'DIETARY', 'BEHAVIOURAL'])
  })

  it('offers a recipe its own vocabulary and dietary claims only', () => {
    expect(TAG_KINDS_BY_SURFACE.RECIPE).toEqual(['RECIPE', 'DIETARY'])
  })

  /** The fault that started the phase, in both directions. */
  it('keeps recipe words off items and behavioural tags off recipes', () => {
    expect(isTagKindOffered('RECIPE', 'ITEM')).toBe(false)
    expect(isTagKindOffered('BEHAVIOURAL', 'RECIPE')).toBe(false)
  })

  /** A claim about contents describes the product and the dish equally. */
  it('offers dietary on both surfaces', () => {
    expect(isTagKindOffered('DIETARY', 'ITEM')).toBe(true)
    expect(isTagKindOffered('DIETARY', 'RECIPE')).toBe(true)
  })
})

describe('tagsForSurface', () => {
  const pool = [
    tag('chilled', 'ITEM'),
    tag('dinner', 'RECIPE'),
    tag('vegan', 'DIETARY'),
    tag('quick-add', 'BEHAVIOURAL'),
  ]

  it('narrows a mixed pool to what an item may carry', () => {
    expect(tagsForSurface(pool, 'ITEM').map((t) => t.name)).toEqual([
      'chilled',
      'vegan',
      'quick-add',
    ])
  })

  it('narrows a mixed pool to what a recipe may carry', () => {
    expect(tagsForSurface(pool, 'RECIPE').map((t) => t.name)).toEqual(['dinner', 'vegan'])
  })

  it('keeps the order it was given, so a caller can decide it', () => {
    const reversed = [...pool].reverse()
    expect(tagsForSurface(reversed, 'ITEM').map((t) => t.name)).toEqual([
      'quick-add',
      'vegan',
      'chilled',
    ])
  })
})

describe('what the model may suggest', () => {
  /**
   * Narrower than what the surface offers, and the point of the whole phase: only
   * ITEM says what a product *is* in a way a name can support.
   */
  it('allows item vocabulary alone', () => {
    expect(SUGGESTIBLE_TAG_KINDS).toEqual(['ITEM'])
    expect(mayModelSuggestTagKind('ITEM')).toBe(true)
  })

  /** A dietary claim is readable off a packet, never inferred from a name. */
  it('withholds dietary claims', () => {
    expect(mayModelSuggestTagKind('DIETARY')).toBe(false)
  })

  /** `quick-add` is a household's decision about the app, not a fact. */
  it('withholds behavioural and recipe kinds', () => {
    expect(mayModelSuggestTagKind('BEHAVIOURAL')).toBe(false)
    expect(mayModelSuggestTagKind('RECIPE')).toBe(false)
  })

  /** Suggestion runs on items, so anything it may pick must be offerable there. */
  it('only allows kinds an item can actually carry', () => {
    for (const kind of SUGGESTIBLE_TAG_KINDS) {
      expect(isTagKindOffered(kind, 'ITEM')).toBe(true)
    }
  })
})

describe('creation infers a kind from its surface', () => {
  it('files a tag made while tagging an item as item vocabulary', () => {
    expect(defaultTagKindFor('ITEM')).toBe('ITEM')
  })

  it('files a tag made while tagging a recipe as recipe vocabulary', () => {
    expect(defaultTagKindFor('RECIPE')).toBe('RECIPE')
  })

  /** Whatever a surface creates, that surface must then be able to offer. */
  it('never creates a kind its own surface would hide', () => {
    expect(isTagKindOffered(defaultTagKindFor('ITEM'), 'ITEM')).toBe(true)
    expect(isTagKindOffered(defaultTagKindFor('RECIPE'), 'RECIPE')).toBe(true)
  })
})

/** The settings card renders these, so a new kind must not ship without words. */
describe('kind labels', () => {
  it('names and explains every kind', () => {
    for (const kind of TAG_KINDS) {
      expect(TAG_KIND_LABELS[kind].label).not.toBe('')
      expect(TAG_KIND_LABELS[kind].description).not.toBe('')
    }
  })

  /** Every kind must be reachable from some surface, or it can never be applied. */
  it('leaves no kind unreachable', () => {
    const reachable = new Set(Object.values(TAG_KINDS_BY_SURFACE).flat())
    expect([...TAG_KINDS].every((kind) => reachable.has(kind))).toBe(true)
  })
})
