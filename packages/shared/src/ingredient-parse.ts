/**
 * Free-text ingredient parsing for recipe import (spec §8.5).
 *
 * schema.org `recipeIngredient` entries are plain strings like "200 g plain
 * flour", "2 large eggs" or "Salt to taste". This pure helper splits a line into
 * the {@link Item} fields Hame needs — quantity, display unit, name, notes — so
 * the importer can find-or-create a linked Item for every ingredient.
 *
 * It is deliberately forgiving: anything it can't parse falls back to treating
 * the whole line as the item name with no quantity. No Prisma, no network —
 * unit-testable in isolation.
 */
import { isKnownUnit } from './units.js'

export interface ParsedIngredient {
  itemName: string
  quantity: number | null
  unit: string | null
  notes: string | null
  /** Non-shoppable staple (salt, water, "to taste") — excluded from generated lists. */
  isStaple: boolean
}

/** Unicode fraction glyphs → decimal value. */
const VULGAR_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
}

/** Items that are kept for recipe fidelity but never added to a shopping list. */
const STAPLE_NAMES = new Set([
  'salt',
  'pepper',
  'salt and pepper',
  'salt & pepper',
  'water',
  'cold water',
  'warm water',
  'boiling water',
  'ice',
])

/** Replace unicode vulgar fractions (incl. a glued whole number) with decimals. */
function normaliseFractions(input: string): string {
  const glyphs = Object.keys(VULGAR_FRACTIONS).join('')
  return input.replace(
    new RegExp(`(\\d*)\\s*([${glyphs}])`, 'g'),
    (_m, whole: string, glyph: string) =>
      String((whole ? parseInt(whole, 10) : 0) + VULGAR_FRACTIONS[glyph]),
  )
}

/**
 * Consume a leading quantity from the front of a line, returning the numeric
 * value and the remainder. Handles mixed numbers ("1 1/2"), simple fractions
 * ("1/2"), decimals and ranges ("2-3" → lower bound). The match deliberately
 * does not require a trailing space, so a unit glued to the number ("100g",
 * "200ml") leaves the unit in the remainder to be picked up next.
 */
function consumeQuantity(s: string): { value: number | null; rest: string } {
  // Mixed number: "1 1/2".
  let m = /^(\d+)\s+(\d+)\/(\d+)(?=\s|$)/.exec(s)
  if (m && Number(m[3]) !== 0) {
    return { value: Number(m[1]) + Number(m[2]) / Number(m[3]), rest: s.slice(m[0].length) }
  }
  // Simple fraction: "1/2".
  m = /^(\d+)\/(\d+)/.exec(s)
  if (m && Number(m[2]) !== 0) {
    return { value: Number(m[1]) / Number(m[2]), rest: s.slice(m[0].length) }
  }
  // Integer/decimal with an optional range ("2", "1.5", "2-3"); take the lower bound.
  m = /^(\d+(?:\.\d+)?)(?:\s*[-–—]\s*\d+(?:\.\d+)?)?/.exec(s)
  if (m) {
    return { value: Number(m[1]), rest: s.slice(m[0].length) }
  }
  return { value: null, rest: s }
}

/** Split a "name, note" tail into its name and an optional preparation note. */
function splitNote(rest: string): { name: string; notes: string | null } {
  const commaIdx = rest.indexOf(',')
  if (commaIdx >= 0) {
    const name = rest.slice(0, commaIdx).trim()
    const notes = rest.slice(commaIdx + 1).trim()
    return { name, notes: notes || null }
  }
  return { name: rest.trim(), notes: null }
}

/** Parse one free-text ingredient line into structured {@link Item} fields. */
export function parseIngredientLine(line: string): ParsedIngredient {
  const cleaned = normaliseFractions(line.replace(/\s+/g, ' ').trim())
  if (!cleaned) {
    return { itemName: '', quantity: null, unit: null, notes: null, isStaple: false }
  }

  const { value: quantity, rest } = consumeQuantity(cleaned)
  let remainder = rest.trim()

  // A recognised unit immediately after the quantity becomes the display unit
  // (works whether the unit was space-separated "200 g" or glued "200g").
  let unit: string | null = null
  if (quantity != null && remainder) {
    const [firstToken, ...others] = remainder.split(' ')
    if (isKnownUnit(firstToken)) {
      unit = firstToken
      remainder = others.join(' ')
    }
  }

  const { name, notes } = splitNote(remainder)
  const finalName = name || cleaned
  const lowerName = finalName.toLowerCase()

  // Staple when it's a known pantry staple, or quantity-less ("salt to taste").
  const isStaple =
    STAPLE_NAMES.has(lowerName) || /\bto taste\b/.test(lowerName) || (quantity == null && !unit)

  return {
    itemName: finalName,
    quantity,
    unit,
    notes,
    isStaple,
  }
}
