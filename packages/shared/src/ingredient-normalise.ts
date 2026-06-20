/**
 * Ingredient normalisation contract + the two dependency-free layers (spec §10
 * Phase 4.5).
 *
 * A normaliser turns the free-text ingredient lines a recipe import produces
 * into clean, linkable {@link Item} data. The layers stack — each falls back to
 * the one below when it has no better answer:
 *
 *   `[1]` {@link BasicNormaliser}      regex parser, always the floor
 *   `[2]` {@link DictionaryNormaliser} bundled lookup table on top of Basic
 *   `[3]`  LlmNormaliser (API-side)    batched Ollama pass on top of Dictionary
 *
 * Recipe import and `findOrCreateItemByName` consume the same
 * {@link NormalisedIngredient} shape regardless of which layer ran, and the
 * whole list is normalised at once so the LLM makes one call per recipe.
 *
 * This module is pure (no network) — the LLM layer lives in the API because it
 * does I/O, but it implements this same {@link IngredientNormaliser} interface.
 */
import type { NormaliserStrategy } from './constants/index.js'
import { parseIngredientLine } from './ingredient-parse.js'
import { lookupIngredient } from './ingredient-dictionary.js'
import { baseUnitOf, type BaseUnit } from './units.js'

/** One ingredient resolved to structured {@link Item} fields. */
export interface NormalisedIngredient {
  /** The original free-text line, kept so the review UI can show before/after. */
  raw: string
  canonicalName: string
  quantity: number | null
  unit: string | null
  /** Optional preparation note ("finely chopped"), preserved from the raw line. */
  notes: string | null
  baseUnit: BaseUnit | null
  isStaple: boolean
  /** Approx grams of one countable unit, when known (1 onion ≈ 110 g). */
  typicalUnitGrams: number | null
  /** Which layer produced this line — surfaced in the review UI. */
  source: NormaliserStrategy
}

/** Result of normalising a recipe's ingredient list. */
export interface NormaliseResult {
  ingredients: NormalisedIngredient[]
  /** Human-readable notes (e.g. "LLM unavailable — used the dictionary"). */
  warnings: string[]
}

/** Strategy contract — takes the whole list so the LLM batches one call. */
export interface IngredientNormaliser {
  readonly strategy: NormaliserStrategy
  normalise(rawLines: string[]): Promise<NormaliseResult>
}

/** Infer a base unit from a parsed line: its unit's family, else count vs none. */
function inferBaseUnit(unit: string | null, quantity: number | null): BaseUnit | null {
  if (unit) return baseUnitOf(unit)
  return quantity != null ? 'unit' : null
}

// ── [1] Basic ──────────────────────────────────────────────────────────────

/** The regex parser standing alone — zero setup, the guaranteed fallback. */
export class BasicNormaliser implements IngredientNormaliser {
  readonly strategy: NormaliserStrategy = 'BASIC'

  normalise(rawLines: string[]): Promise<NormaliseResult> {
    return Promise.resolve({
      ingredients: rawLines.map((raw) => basicLine(raw)),
      warnings: [],
    })
  }
}

/** Normalise one line with the regex parser only. Exported for the layers above. */
export function basicLine(raw: string): NormalisedIngredient {
  const parsed = parseIngredientLine(raw)
  return {
    raw,
    canonicalName: parsed.itemName,
    quantity: parsed.quantity,
    unit: parsed.unit,
    notes: parsed.notes,
    baseUnit: inferBaseUnit(parsed.unit, parsed.quantity),
    isStaple: parsed.isStaple,
    typicalUnitGrams: null,
    source: 'BASIC',
  }
}

// ── [2] Dictionary ──────────────────────────────────────────────────────────

/**
 * Runs Basic, then enriches each line from the bundled dictionary: a cleaner
 * canonical name, a reliable base unit, a typical per-unit weight, and the
 * staple flag. Unknown items keep their Basic result untouched. Quantity and
 * display unit always stay as parsed — only the item's identity is canonicalised.
 */
export class DictionaryNormaliser implements IngredientNormaliser {
  readonly strategy: NormaliserStrategy = 'DICTIONARY'

  normalise(rawLines: string[]): Promise<NormaliseResult> {
    return Promise.resolve({
      ingredients: rawLines.map((raw) => dictionaryLine(raw)),
      warnings: [],
    })
  }
}

/** Normalise one line with Basic + dictionary enrichment. Exported for the LLM layer. */
export function dictionaryLine(raw: string): NormalisedIngredient {
  const base = basicLine(raw)
  const entry = lookupIngredient(base.canonicalName)
  if (!entry) return base
  return {
    ...base,
    canonicalName: entry.canonicalName,
    // The dictionary knows the item's canonical unit, so its base unit wins —
    // e.g. "2 onions" parses as a count but onions stock by weight (with
    // typicalUnitGrams bridging count → grams). The display unit is untouched.
    baseUnit: entry.baseUnit,
    typicalUnitGrams: entry.typicalUnitGrams ?? null,
    // A dictionary staple flag promotes; it never clears a parser-detected one.
    isStaple: base.isStaple || Boolean(entry.isStaple),
    source: 'DICTIONARY',
  }
}
