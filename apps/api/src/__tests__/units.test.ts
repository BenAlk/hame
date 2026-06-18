import { describe, it, expect } from 'vitest'
import { baseUnitOf, convertToBase, isKnownUnit } from '@hame/shared'

describe('convertToBase', () => {
  it('scales mass units to grams', () => {
    expect(convertToBase(2, 'kg', 'g')).toBe(2000)
    expect(convertToBase(500, 'g', 'g')).toBe(500)
    expect(convertToBase(250, 'mg', 'g')).toBe(0.25)
  })

  it('scales volume units to millilitres', () => {
    expect(convertToBase(1, 'l', 'ml')).toBe(1000)
    expect(convertToBase(33, 'cl', 'ml')).toBe(330)
  })

  it('treats counted units (pack/bottle/can) as one base unit each', () => {
    expect(convertToBase(3, 'pack', 'unit')).toBe(3)
    expect(convertToBase(2, 'bottles', 'unit')).toBe(2)
  })

  it('handles plurals and casing', () => {
    expect(convertToBase(2, 'KG', 'g')).toBe(2000)
    expect(convertToBase(2, 'Litres', 'ml')).toBe(2000)
  })

  it('assumes a bare quantity is already in the base unit', () => {
    expect(convertToBase(5, null, 'unit')).toBe(5)
    expect(convertToBase(5, undefined, 'g')).toBe(5)
  })

  it('returns null across incompatible families (no silent 500g + 2 bottles)', () => {
    expect(convertToBase(2, 'bottle', 'g')).toBeNull()
    expect(convertToBase(500, 'g', 'ml')).toBeNull()
  })

  it('returns null for an unknown unit or missing baseUnit', () => {
    expect(convertToBase(1, 'sprig', 'g')).toBeNull()
    expect(convertToBase(1, 'g', null)).toBeNull()
  })
})

describe('unit helpers', () => {
  it('reports known units', () => {
    expect(isKnownUnit('kg')).toBe(true)
    expect(isKnownUnit('packs')).toBe(true)
    expect(isKnownUnit('sprig')).toBe(false)
  })

  it('reports the base family of a unit', () => {
    expect(baseUnitOf('kg')).toBe('g')
    expect(baseUnitOf('cl')).toBe('ml')
    expect(baseUnitOf('jar')).toBe('unit')
    expect(baseUnitOf('sprig')).toBeNull()
  })
})
