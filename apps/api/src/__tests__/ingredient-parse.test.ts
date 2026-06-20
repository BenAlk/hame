import { describe, it, expect } from 'vitest'
import { parseIngredientLine } from '@hame/shared'

describe('parseIngredientLine', () => {
  it('splits a quantity, unit and name', () => {
    expect(parseIngredientLine('200 g plain flour')).toMatchObject({
      itemName: 'plain flour',
      quantity: 200,
      unit: 'g',
      isStaple: false,
    })
  })

  it('splits a unit glued to the number (BBC Good Food style)', () => {
    expect(parseIngredientLine('100g plain couscous')).toMatchObject({
      itemName: 'plain couscous',
      quantity: 100,
      unit: 'g',
    })
    expect(parseIngredientLine('200ml boiling hot stock, chicken or vegetable')).toMatchObject({
      itemName: 'boiling hot stock',
      quantity: 200,
      unit: 'ml',
      notes: 'chicken or vegetable',
    })
    expect(parseIngredientLine('1.5kg potatoes')).toMatchObject({
      itemName: 'potatoes',
      quantity: 1.5,
      unit: 'kg',
    })
  })

  it('handles a count with no unit', () => {
    expect(parseIngredientLine('2 large eggs')).toMatchObject({
      itemName: 'large eggs',
      quantity: 2,
      unit: null,
    })
  })

  it('reads a vulgar fraction', () => {
    expect(parseIngredientLine('½ tsp salt')).toMatchObject({ quantity: 0.5, unit: 'tsp' })
  })

  it('reads a whole-plus-fraction quantity', () => {
    expect(parseIngredientLine('1 1/2 cups milk')).toMatchObject({ quantity: 1.5, unit: 'cups' })
  })

  it('takes the lower bound of a range', () => {
    expect(parseIngredientLine('2-3 cloves garlic')).toMatchObject({ quantity: 2 })
  })

  it('splits a preparation note after a comma', () => {
    expect(parseIngredientLine('1 onion, finely chopped')).toMatchObject({
      itemName: 'onion',
      notes: 'finely chopped',
      quantity: 1,
    })
  })

  it('marks known staples and "to taste" items as staples', () => {
    expect(parseIngredientLine('Salt and pepper to taste').isStaple).toBe(true)
    expect(parseIngredientLine('salt').isStaple).toBe(true)
  })

  it('treats an unquantified ingredient as a staple', () => {
    expect(parseIngredientLine('Olive oil')).toMatchObject({ quantity: null, isStaple: true })
  })

  it('falls back to the whole line when nothing parses', () => {
    expect(parseIngredientLine('a handful of fresh basil')).toMatchObject({
      itemName: 'a handful of fresh basil',
      quantity: null,
    })
  })
})
