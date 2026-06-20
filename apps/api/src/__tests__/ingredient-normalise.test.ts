import { describe, it, expect } from 'vitest'
import { BasicNormaliser, DictionaryNormaliser, lookupIngredient } from '@hame/shared'

describe('BasicNormaliser', () => {
  it('parses lines with quantity, unit and name (the always-on floor)', async () => {
    const { ingredients, warnings } = await new BasicNormaliser().normalise([
      '200 g plain flour',
      '2 eggs',
      'Salt to taste',
    ])
    expect(warnings).toEqual([])
    expect(ingredients[0]).toMatchObject({
      canonicalName: 'plain flour',
      quantity: 200,
      unit: 'g',
      baseUnit: 'g',
      source: 'BASIC',
    })
    expect(ingredients[1]).toMatchObject({ quantity: 2, baseUnit: 'unit' })
    expect(ingredients[2].isStaple).toBe(true)
  })

  it('keeps the raw line for review', async () => {
    const { ingredients } = await new BasicNormaliser().normalise(['1 large onion, finely chopped'])
    expect(ingredients[0].raw).toBe('1 large onion, finely chopped')
    expect(ingredients[0].notes).toBe('finely chopped')
  })
})

describe('lookupIngredient', () => {
  it('matches directly, tolerating plurals and descriptors', () => {
    expect(lookupIngredient('onion')?.canonicalName).toBe('onion')
    expect(lookupIngredient('onions')?.canonicalName).toBe('onion')
    expect(lookupIngredient('large red onion')?.canonicalName).toBe('red onion')
    expect(lookupIngredient('free-range eggs')?.canonicalName).toBe('egg')
  })

  it('resolves synonyms to the canonical entry', () => {
    expect(lookupIngredient('scallion')?.canonicalName).toBe('spring onion')
    expect(lookupIngredient('passata')?.canonicalName).toBe('chopped tomatoes')
  })

  it('returns null for unknown items', () => {
    expect(lookupIngredient('dragonfruit')).toBeNull()
  })
})

describe('DictionaryNormaliser', () => {
  it('overrides the basic result with canonical data when known', async () => {
    const { ingredients } = await new DictionaryNormaliser().normalise(['2 large onions, diced'])
    expect(ingredients[0]).toMatchObject({
      canonicalName: 'onion',
      quantity: 2,
      baseUnit: 'g',
      typicalUnitGrams: 110,
      notes: 'diced',
      source: 'DICTIONARY',
    })
  })

  it('promotes the staple flag from the dictionary', async () => {
    const { ingredients } = await new DictionaryNormaliser().normalise(['2 tbsp olive oil'])
    expect(ingredients[0]).toMatchObject({
      canonicalName: 'olive oil',
      isStaple: true,
      baseUnit: 'ml',
    })
  })

  it('falls back to the basic result for unknown items', async () => {
    const { ingredients } = await new DictionaryNormaliser().normalise(['100 g dragonfruit'])
    expect(ingredients[0]).toMatchObject({
      canonicalName: 'dragonfruit',
      quantity: 100,
      baseUnit: 'g',
      typicalUnitGrams: null,
      source: 'BASIC',
    })
  })
})
