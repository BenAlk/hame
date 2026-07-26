import { describe, it, expect } from 'vitest'
import { toSuggestion } from '../integrations/open-food-facts/index.js'

describe('toSuggestion', () => {
  it('maps a found product', () => {
    expect(
      toSuggestion({
        status: 1,
        product: { product_name: 'Semi Skimmed Milk', brands: 'Lidl', quantity: '2 l' },
      }),
    ).toEqual({ name: 'Semi Skimmed Milk', brand: 'Lidl', quantity: '2 l' })
  })

  it('returns null when the product is not found', () => {
    expect(toSuggestion({ status: 0, product: {} })).toBeNull()
    expect(toSuggestion({ status: 1 })).toBeNull()
  })

  /** OFF is crowd-sourced, so absent or blank fields are routine, not exceptional. */
  it('returns null when no usable name is present', () => {
    expect(toSuggestion({ status: 1, product: { brands: 'Lidl' } })).toBeNull()
    expect(toSuggestion({ status: 1, product: { product_name: '   ' } })).toBeNull()
  })

  it('falls back through the name fields', () => {
    expect(toSuggestion({ status: 1, product: { product_name_en: 'Oat Milk' } })?.name).toBe(
      'Oat Milk',
    )
    expect(toSuggestion({ status: 1, product: { generic_name: 'Oat drink' } })?.name).toBe(
      'Oat drink',
    )
  })

  it('takes only the first of a comma-separated brand list', () => {
    expect(
      toSuggestion({ status: 1, product: { product_name: 'Beans', brands: 'Heinz, Heinz UK' } })
        ?.brand,
    ).toBe('Heinz')
  })

  it('tolerates rubbish without throwing', () => {
    expect(toSuggestion(null)).toBeNull()
    expect(toSuggestion('nope')).toBeNull()
    expect(toSuggestion({ status: 1, product: { product_name: 42, brands: [] } })).toBeNull()
  })
})
