/**
 * Unit normalisation for stock maths (spec §9.2).
 *
 * `PantryEntry`, `ShoppingListItem` and `RecipeIngredient` store a free-form
 * `unit` for display, but any feature that sums or subtracts quantities across
 * rows (low-stock alerts §8.4, generate-shopping-list §8.6) must first convert
 * every quantity to the item's canonical `baseUnit`. Rows whose unit cannot be
 * converted to the base unit are excluded and surfaced as a warning, never
 * silently added — this prevents "500 g + 2 bottles = 502" bugs.
 */

/** The three canonical base units an Item can normalise to. */
export const BASE_UNITS = ['g', 'ml', 'unit'] as const
export type BaseUnit = (typeof BASE_UNITS)[number]

/**
 * Display unit → { base, factor }. A display quantity in `unit` equals
 * `quantity × factor` of `base`. Lookups are case-insensitive and ignore a
 * trailing plural "s" (handled in {@link normaliseUnit}).
 */
const UNIT_TABLE: Record<string, { base: BaseUnit; factor: number }> = {
  // mass → grams
  g: { base: 'g', factor: 1 },
  gram: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  kilogram: { base: 'g', factor: 1000 },
  mg: { base: 'g', factor: 0.001 },
  // volume → millilitres
  ml: { base: 'ml', factor: 1 },
  millilitre: { base: 'ml', factor: 1 },
  l: { base: 'ml', factor: 1000 },
  litre: { base: 'ml', factor: 1000 },
  cl: { base: 'ml', factor: 10 },
  // count → unit
  unit: { base: 'unit', factor: 1 },
  pack: { base: 'unit', factor: 1 },
  bottle: { base: 'unit', factor: 1 },
  can: { base: 'unit', factor: 1 },
  tin: { base: 'unit', factor: 1 },
  jar: { base: 'unit', factor: 1 },
  box: { base: 'unit', factor: 1 },
  bag: { base: 'unit', factor: 1 },
  piece: { base: 'unit', factor: 1 },
  item: { base: 'unit', factor: 1 },
}

/** Lower-case, trim, and strip a single trailing plural "s" ("packs" → "pack"). */
function normaliseUnit(unit: string): string {
  const u = unit.trim().toLowerCase()
  return u.endsWith('s') && u.length > 1 && UNIT_TABLE[u.slice(0, -1)] ? u.slice(0, -1) : u
}

/** True when `unit` is a recognised display unit that maps onto a base unit. */
export function isKnownUnit(unit: string): boolean {
  return normaliseUnit(unit) in UNIT_TABLE
}

/** The base unit a display `unit` normalises to, or `null` if unrecognised. */
export function baseUnitOf(unit: string): BaseUnit | null {
  return UNIT_TABLE[normaliseUnit(unit)]?.base ?? null
}

/**
 * Convert `quantity` in display `unit` to the item's `baseUnit`. Returns `null`
 * (caller should exclude + warn) when:
 *   - `baseUnit` is null/empty (item has no canonical unit), or
 *   - `unit` is unrecognised, or
 *   - `unit` and `baseUnit` belong to different families (e.g. g → ml).
 */
export function convertToBase(
  quantity: number,
  unit: string | null | undefined,
  baseUnit: string | null | undefined,
): number | null {
  if (!baseUnit) return null
  // A bare quantity (no display unit) is assumed to already be in the base unit.
  if (!unit) return quantity
  const entry = UNIT_TABLE[normaliseUnit(unit)]
  if (!entry || entry.base !== normaliseUnit(baseUnit)) return null
  return quantity * entry.factor
}
