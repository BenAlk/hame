import { describe, it, expect } from 'vitest'
import { toSuggestion, stripBrand } from '../integrations/open-food-facts/index.js'

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

describe('stripBrand', () => {
  it('drops a leading brand and a trailing pack size', () => {
    expect(stripBrand('Tesco British Semi Skimmed Milk 2.272L', 'Tesco')).toBe(
      'British Semi Skimmed Milk',
    )
    expect(stripBrand('Alpro Oat Drink 1 l', 'Alpro')).toBe('Oat Drink')
    expect(stripBrand('Coca-Cola Zero 6 x 330ml', 'Coca-Cola')).toBe('Zero')
  })

  it('drops a trailing brand too', () => {
    expect(stripBrand('Baked Beans Heinz', 'Heinz')).toBe('Baked Beans')
  })

  it('leaves a brand alone in the middle of a name', () => {
    // Cutting mid-name would mangle a product genuinely named after its brand.
    expect(stripBrand('Made with Tesco Milk', 'Tesco')).toBe('Made with Tesco Milk')
  })

  it('works with no brand, and never strips a name down to nothing', () => {
    expect(stripBrand('Semi Skimmed Milk', null)).toBe('Semi Skimmed Milk')
    expect(stripBrand('Tesco', 'Tesco')).toBe('Tesco')
    expect(stripBrand('500g', null)).toBe('500g')
  })

  it('is case-insensitive about the brand', () => {
    expect(stripBrand('TESCO Semi Skimmed Milk', 'Tesco')).toBe('Semi Skimmed Milk')
  })
})
