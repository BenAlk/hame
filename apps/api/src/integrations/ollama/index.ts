/**
 * Ollama-backed ingredient normaliser — layer `[3]` of the Phase 4.5 stack
 * (spec §10, §12). It runs a deterministic fallback first (the dictionary, which
 * itself wraps the regex parser), then a single batched Ollama call per recipe
 * that canonicalises names, fills units and flags staples. It only overrides
 * the fallback where the model gives a usable answer, and degrades gracefully —
 * an unreachable or malformed model yields the fallback result plus a warning,
 * never a failed import.
 *
 * The fetch is the only I/O here; {@link buildNormalisePrompt} and
 * {@link parseLlmResponse} are pure and unit-tested without the network.
 */
import {
  BASE_UNITS,
  STORAGE_TYPES,
  type IngredientNormaliser,
  type NormalisedIngredient,
  type NormaliseResult,
  type NormaliserStrategy,
  type StorageType,
} from '@hame/shared'
import { logger } from '../../lib/logger.js'
import type { ExtractedRecipe } from '../recipe-import/index.js'

/**
 * The batch call is bounded by a budget that grows with the list, because the
 * timeout covers the whole recipe rather than a single line — a 40-ingredient
 * import on a CPU-only server takes several times as long as a short one, and a
 * flat ceiling would abandon exactly the imports the model helps most with.
 */
const TIMEOUT_BASE_MS = 30_000
const TIMEOUT_PER_LINE_MS = 1_500
const TIMEOUT_MAX_MS = 120_000
const WARMUP_TIMEOUT_MS = 60_000

/**
 * Extraction reads a page of text and writes a whole recipe back, so it is a
 * bigger job than the per-line normalisation batch and gets a flat, generous
 * budget. It only ever runs on a page that would otherwise have failed outright.
 */
const EXTRACT_TIMEOUT_MS = 90_000

/**
 * Tag suggestion and product canonicalisation are both a handful of tokens in
 * and a handful out, and both sit in front of someone waiting — a name being
 * typed, a barcode just scanned. They get a short budget and simply give up.
 */
const TAG_TIMEOUT_MS = 15_000
const SECTION_TIMEOUT_MS = 15_000
const STORAGE_TIMEOUT_MS = 15_000
const CANONICAL_TIMEOUT_MS = 15_000

/**
 * How long Ollama should hold the model in memory after a warm-up. Its default
 * is 5 minutes, which routinely expires while the user is still finding and
 * pasting a URL — the preload would then pay the load cost for nothing and the
 * import pay it again. This spans a realistic dwell in the import modal.
 */
const WARMUP_KEEP_ALIVE = '15m'

/**
 * Context window for the batch call. Ollama applies a small default (2–4k
 * depending on build) whatever the model supports, and **silently truncates**
 * the prompt rather than erroring — which would drop the tail of a long
 * ingredient list and read as "the model ignored the last few lines". The
 * output counts against this too, so this leaves headroom for a long recipe
 * plus its JSON reply.
 */
const NUM_CTX = 8_192

/** One ingredient as the model is asked to return it. */
export interface LlmIngredient {
  index: number
  canonicalName?: string
  quantity?: number | null
  unit?: string | null
  baseUnit?: string | null
  isStaple?: boolean
  typicalUnitGrams?: number | null
}

export interface OllamaSettings {
  url: string
  model: string
}

/**
 * LLM normaliser. Constructed with a connected Ollama config and the fallback
 * normaliser to layer on top of (always the dictionary in the factory).
 */
export class LlmNormaliser implements IngredientNormaliser {
  readonly strategy: NormaliserStrategy = 'LLM'

  constructor(
    private readonly settings: OllamaSettings,
    private readonly fallback: IngredientNormaliser,
  ) {}

  async normalise(rawLines: string[]): Promise<NormaliseResult> {
    const base = await this.fallback.normalise(rawLines)
    if (rawLines.length === 0) return base

    let overrides: LlmIngredient[]
    try {
      overrides = await this.callOllama(rawLines)
    } catch (err) {
      logger.warn({ err }, 'Ollama normalisation failed; using fallback')
      const fallback = describe(this.fallback.strategy)
      // A thrown TypeError means fetch never connected; anything else means the
      // server answered but rejected us (e.g. the model isn't installed).
      const reason =
        err instanceof TypeError
          ? 'Could not reach the language model'
          : `The language model rejected the request (${err instanceof Error ? err.message : 'unknown error'})`
      return {
        ingredients: base.ingredients,
        warnings: [...base.warnings, `${reason} — used the ${fallback} instead.`],
      }
    }

    const ingredients = base.ingredients.map((line, i) =>
      applyOverride(
        line,
        overrides.find((o) => o.index === i),
      ),
    )

    // A reply that parsed but carried nothing usable — or covered only some of
    // the lines — degrades to the fallback just as surely as an unreachable
    // server, so it is reported the same way. Silence here would hand back
    // dictionary-quality output with no hint that the model added nothing.
    const applied = ingredients.filter((line) => line.source === 'LLM').length
    const warnings = [...base.warnings]
    const fallback = describe(this.fallback.strategy)
    if (applied === 0) {
      warnings.push(`The language model returned nothing usable — used the ${fallback} instead.`)
    } else if (applied < ingredients.length) {
      warnings.push(
        `The language model normalised ${applied} of ${ingredients.length} lines — ` +
          `the rest used the ${fallback}.`,
      )
    }
    return { ingredients, warnings }
  }

  /**
   * Preload the model into the server's memory without running any inference,
   * so a subsequent {@link normalise} call skips the cold model-load (seconds to
   * tens of seconds for a large model). Fire-and-forget: it swallows every
   * error — an unreachable or misconfigured Ollama just means the real import
   * pays the load cost as it would have anyway. Triggered when the user opens
   * the recipe-import modal, overlapping the load with their think-time.
   *
   * Ollama loads a model when sent a `/api/generate` request with no prompt; we
   * never wait on the response beyond the timeout that bounds the in-flight
   * fetch. {@link WARMUP_KEEP_ALIVE} is what makes the preload worth doing — the
   * default eviction is shorter than the modal is realistically open.
   */
  async warmUp(): Promise<void> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS)
    try {
      await fetch(`${trimSlash(this.settings.url)}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.settings.model,
          stream: false,
          keep_alive: WARMUP_KEEP_ALIVE,
        }),
      })
    } catch (err) {
      logger.debug({ err }, 'Ollama warm-up failed (ignored)')
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Last-resort recipe extraction for a page with no schema.org data (spec §8.5).
   * The structured-data path is always preferred — it is exact, free and
   * instant; this runs only when there is nothing to parse, turning a hard
   * "no recipe data found" into a draft the user was going to review anyway.
   *
   * Returns the lines **verbatim** rather than pre-normalised: the caller feeds
   * them through the ordinary {@link normalise} pass, so extraction and
   * normalisation stay two simple prompts instead of one hard one, and the
   * well-tested normalisation path is reused rather than duplicated.
   *
   * Null on anything unusable — an unreachable model, an unparseable reply, or a
   * page that simply is not a recipe. The caller then fails as it did before.
   */
  async extractRecipe(pageText: string): Promise<ExtractedRecipe | null> {
    try {
      const content = await this.chat(
        EXTRACT_SYSTEM_PROMPT,
        buildExtractPrompt(pageText),
        EXTRACT_FORMAT,
        EXTRACT_TIMEOUT_MS,
      )
      return parseExtractedRecipe(content)
    } catch (err) {
      logger.warn({ err }, 'Ollama recipe extraction failed')
      return null
    }
  }

  /**
   * Suggest tags for an item name, drawn from `pool` (spec §12). The pool is
   * compiled straight into the reply schema's enum, so choosing a tag the
   * household does not have is not merely discouraged by the prompt — the
   * grammar cannot emit it. That turns the classic failure of this feature,
   * a model inventing a plausible near-duplicate of an existing tag, into an
   * impossibility rather than something to filter out afterwards.
   *
   * **Throws** if the call does not complete. A suggestion is a convenience and
   * must never block naming an item — but swallowing the failure here would make
   * it indistinguishable from "the model chose none", and the two need different
   * words in front of a user. The caller decides how to report it; it stays a
   * convenience because the caller keeps going either way.
   */
  async suggestTags(itemName: string, pool: string[]): Promise<string[]> {
    if (pool.length === 0) return []
    try {
      const content = await this.chat(
        TAG_SYSTEM_PROMPT,
        buildTagPrompt(itemName, pool),
        tagFormat(pool),
        TAG_TIMEOUT_MS,
      )
      return parseSuggestedTags(content, pool)
    } catch (err) {
      logger.warn({ err, itemName }, 'Ollama tag suggestion failed')
      throw err
    }
  }

  /**
   * Suggest which section of the shop an item belongs in, from `pool` (§8.3).
   *
   * The tighter sibling of {@link suggestTags}: a section is single-valued, so
   * the reply schema is one choice from a closed list rather than a set, and the
   * grammar cannot return two aisles for something that lives in one. `pool` is
   * passed in walking order, which is also the order the model reads it in.
   *
   * Null means the model **declined**. It sits in front of someone filling in a
   * form, so it gets a short budget — and if that budget runs out this **throws**
   * rather than returning null, because "still loading" and "can't place it" are
   * not the same thing to tell someone.
   */
  async suggestSection(itemName: string, pool: string[]): Promise<string | null> {
    if (pool.length === 0) return null
    try {
      const content = await this.chat(
        SECTION_SYSTEM_PROMPT,
        buildSectionPrompt(itemName, pool),
        sectionFormat(pool),
        SECTION_TIMEOUT_MS,
      )
      return parseSuggestedSection(content, pool)
    } catch (err) {
      logger.warn({ err, itemName }, 'Ollama section suggestion failed')
      throw err
    }
  }

  /**
   * Suggest how an item is kept (§10 Phase 25) — the third of the constrained
   * siblings, and the only one whose enum is a **project constant** rather than
   * the household's rows: nobody renames "frozen", so the grammar is the same on
   * every install.
   *
   * Single-valued for the reason the field exists: as four tags this was a
   * multi-select, and a real model returned both `chilled` and `frozen` for ice
   * cream. Declining is representable, so an item with no sensible storage answer
   * is left alone rather than filed somewhere to satisfy the grammar. Throws on a
   * call that never completed, as its siblings do.
   */
  async suggestStorageType(itemName: string): Promise<StorageType | null> {
    try {
      const content = await this.chat(
        STORAGE_SYSTEM_PROMPT,
        buildStoragePrompt(itemName),
        STORAGE_FORMAT,
        STORAGE_TIMEOUT_MS,
      )
      return parseSuggestedStorageType(content)
    } catch (err) {
      logger.warn({ err, itemName }, 'Ollama storage-type suggestion failed')
      throw err
    }
  }

  /**
   * Reduce a branded supermarket product name to the generic shopping name an
   * `Item` should carry (spec §8.4) — "Tesco British Semi Skimmed Milk 2.272L"
   * to "milk". This is what keeps a barcode library from fragmenting one
   * concept into a row per brand (§9.2).
   *
   * Null on any failure, leaving the caller its deterministic result.
   */
  async canonicaliseProduct(productName: string): Promise<string | null> {
    try {
      const content = await this.chat(
        CANONICAL_SYSTEM_PROMPT,
        buildCanonicalPrompt(productName),
        CANONICAL_FORMAT,
        CANONICAL_TIMEOUT_MS,
      )
      return parseCanonicalName(content)
    } catch (err) {
      logger.warn({ err, productName }, 'Ollama product canonicalisation failed')
      return null
    }
  }

  private async callOllama(rawLines: string[]): Promise<LlmIngredient[]> {
    const content = await this.chat(
      SYSTEM_PROMPT,
      buildNormalisePrompt(rawLines),
      RESPONSE_FORMAT,
      timeoutFor(rawLines.length),
    )
    return parseLlmResponse(content)
  }

  /** One non-streaming, schema-constrained chat turn. Returns the raw content. */
  private async chat(
    system: string,
    user: string,
    format: unknown,
    timeoutMs: number,
  ): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${trimSlash(this.settings.url)}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.settings.model,
          format,
          stream: false,
          options: { temperature: 0, num_ctx: NUM_CTX },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
      if (!res.ok) throw new Error(await describeOllamaError(res, this.settings.model))
      const body = (await res.json()) as { message?: { content?: string } }
      return body.message?.content ?? ''
    } finally {
      clearTimeout(timeout)
    }
  }
}

const SYSTEM_PROMPT =
  'You are a culinary data normaliser. You convert messy recipe ingredient lines ' +
  'into clean structured data. Always reply with strict JSON only.'

/**
 * The response contract, as a JSON Schema handed to Ollama's `format` (0.5+),
 * which constrains decoding to this shape rather than merely to valid JSON.
 * `baseUnit`'s enum is derived from {@link BASE_UNITS}, so the grammar the model
 * generates under and the {@link BaseUnitSchema} that validates everything else
 * cannot drift — the model becomes one more consumer of the shared source of
 * truth instead of the one component free-handing its contract.
 *
 * Only `index` and `canonicalName` are required. The rest stay optional on
 * purpose: {@link applyOverride} distinguishes "the model said nothing" from
 * "the model said none", and forcing every field would turn every silence into
 * an explicit `null` that nulls out a value the deterministic parser got right.
 *
 * {@link parseLlmResponse} still validates the reply. An Ollama older than 0.5
 * ignores an object `format`, so the tolerant parse remains the real guarantee.
 */
const RESPONSE_FORMAT = {
  type: 'object',
  properties: {
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          canonicalName: { type: 'string' },
          quantity: { type: ['number', 'null'] },
          unit: { type: ['string', 'null'] },
          baseUnit: { enum: [...BASE_UNITS, null] },
          isStaple: { type: 'boolean' },
          typicalUnitGrams: { type: ['number', 'null'] },
        },
        required: ['index', 'canonicalName'],
        additionalProperties: false,
      },
    },
  },
  required: ['ingredients'],
  additionalProperties: false,
} as const

/** Build the user prompt for a batch of ingredient lines. Pure. */
export function buildNormalisePrompt(rawLines: string[]): string {
  const numbered = rawLines.map((line, i) => `${i}. ${line}`).join('\n')
  return [
    'Normalise each ingredient line below. Return JSON of the form',
    '{"ingredients":[{"index":0,"canonicalName":"onion","quantity":2,"unit":"unit",',
    '"baseUnit":"g","isStaple":false,"typicalUnitGrams":110}]}.',
    '',
    'Rules:',
    `- baseUnit must be one of ${BASE_UNITS.join(', ')} (the canonical unit for stock maths).`,
    '- canonicalName is the singular, generic shopping name (e.g. "plain flour", "onion").',
    '- quantity is a number or null; unit is the display unit (g, ml, tbsp, unit...) or null.',
    '- isStaple = true for pantry basics never worth shopping for (salt, pepper, water, oil).',
    '- typicalUnitGrams is the approx grams of one countable item, or null if sold by weight/volume.',
    '- Keep one entry per input line, preserving its index. Do not invent extra lines.',
    '',
    numbered,
  ].join('\n')
}

const EXTRACT_SYSTEM_PROMPT =
  'You read a web page and report the recipe printed on it. You never invent ' +
  'ingredients, steps or quantities. Always reply with strict JSON only.'

/** The extraction contract (see {@link RESPONSE_FORMAT} on why it is a schema). */
const EXTRACT_FORMAT = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: ['string', 'null'] },
    servings: { type: ['integer', 'null'] },
    prepTimeMinutes: { type: ['integer', 'null'] },
    cookTimeMinutes: { type: ['integer', 'null'] },
    ingredientLines: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'ingredientLines', 'steps'],
  additionalProperties: false,
} as const

/** Build the extraction prompt for a page's readable text. Pure. */
export function buildExtractPrompt(pageText: string): string {
  return [
    'Below is the readable text of a web page. Report the recipe it contains.',
    '',
    'Rules:',
    '- ingredientLines must be copied VERBATIM as written, one string per line,',
    '  including quantities and units ("200g plain flour", "2 large onions").',
    '- steps are the method, in order, one string per step. Drop step numbering.',
    '- Times are whole minutes. Use null for anything the page does not state.',
    '- Ignore navigation, adverts, comments, and any story before the recipe.',
    '- If the page contains no recipe, reply with an empty ingredientLines array.',
    '',
    '---',
    pageText,
  ].join('\n')
}

/**
 * Parse an extraction reply. Tolerant in the same spirit as
 * {@link parseLlmResponse}, but returns null unless there is a real recipe —
 * a title and at least one ingredient. An empty or shapeless reply must fail
 * the import rather than hand back a convincing but empty draft. Pure.
 */
export function parseExtractedRecipe(content: string): ExtractedRecipe | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>

  const title = typeof o.title === 'string' ? o.title.trim() : ''
  const ingredientLines = toTrimmedStrings(o.ingredientLines)
  if (!title || ingredientLines.length === 0) return null

  return {
    title,
    description: stringOrNull(o.description) ?? null,
    // Mirrors the JSON-LD path's default when a page states no yield.
    servings: positiveInt(o.servings) ?? 4,
    prepTimeMinutes: positiveInt(o.prepTimeMinutes) ?? null,
    cookTimeMinutes: positiveInt(o.cookTimeMinutes) ?? null,
    ingredientLines,
    steps: toTrimmedStrings(o.steps),
  }
}

const TAG_SYSTEM_PROMPT =
  'You label household grocery items with tags from a fixed list. You only ever ' +
  'choose from the list given. Always reply with strict JSON only.'

/** The tag schema is built per call, because the enum *is* the household's pool. */
function tagFormat(pool: string[]) {
  return {
    type: 'object',
    properties: { tags: { type: 'array', items: { enum: pool } } },
    required: ['tags'],
    additionalProperties: false,
  }
}

/** Build the tag-suggestion prompt for an item name and the available pool. Pure. */
export function buildTagPrompt(itemName: string, pool: string[]): string {
  return [
    `Which of these tags apply to the grocery item "${itemName}"?`,
    '',
    `Available tags: ${pool.join(', ')}`,
    '',
    'Rules:',
    '- Choose only from the available tags. Never invent one.',
    '- Choose only tags that clearly apply. Returning none is a valid answer.',
    '- Reply as {"tags":["dairy","chilled"]}.',
  ].join('\n')
}

/**
 * Parse a tag reply, keeping only real pool members and mapping each back to
 * the pool's own spelling so a case difference can't create a near-duplicate.
 * Order follows the pool, not the model, and repeats collapse. Pure.
 */
export function parseSuggestedTags(content: string, pool: string[]): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }
  const raw =
    parsed && typeof parsed === 'object' && Array.isArray((parsed as { tags?: unknown }).tags)
      ? (parsed as { tags: unknown[] }).tags
      : Array.isArray(parsed)
        ? parsed
        : []

  const chosen = new Set(
    raw.filter((t): t is string => typeof t === 'string').map((t) => t.trim().toLowerCase()),
  )
  return pool.filter((tag) => chosen.has(tag.toLowerCase()))
}

const SECTION_SYSTEM_PROMPT =
  'You file household grocery items into the aisle of a shop where they are found. ' +
  'You only ever choose from the list given. Always reply with strict JSON only.'

/**
 * The sentinel for "I can't place this one". A single choice needs a way to
 * decline *inside* the grammar — otherwise the only representable answers are
 * sections, and the model is forced to invent a filing for anything it doesn't
 * recognise. That is the failure this feature would be judged on, so declining
 * is made a first-class option rather than left to the parser to infer.
 */
export const NO_SECTION = 'none'

/**
 * The section schema, built per call because the enum *is* the household's
 * sections. Unlike tags this is a **single** value, which is the tighter
 * constraint: the model picks one of a closed list or declines, and cannot
 * return two aisles for something that lives in one.
 */
function sectionFormat(pool: string[]) {
  return {
    type: 'object',
    properties: { section: { enum: [...pool, NO_SECTION] } },
    required: ['section'],
    additionalProperties: false,
  }
}

/** Build the section prompt for an item name and the household's sections. Pure. */
export function buildSectionPrompt(itemName: string, pool: string[]): string {
  return [
    `Which aisle of a shop is the grocery item "${itemName}" found in?`,
    '',
    `Available sections: ${pool.join(', ')}`,
    '',
    'Rules:',
    '- Choose exactly one, from the available sections only. Never invent one.',
    `- Reply {"section":"${NO_SECTION}"} if none of them clearly fits.`,
    '- Reply as {"section":"Dairy"}.',
  ].join('\n')
}

/**
 * Parse a section reply into a pool member, or null when the model declined or
 * answered unusably. Resolves against the pool's own spelling so a case
 * difference still matches, and checks the pool **before** the sentinel, so a
 * household that really has a section named "none" keeps it. Pure.
 */
export function parseSuggestedSection(content: string, pool: string[]): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const choice = (parsed as { section?: unknown }).section
  if (typeof choice !== 'string') return null
  const wanted = choice.trim().toLowerCase()
  return pool.find((section) => section.toLowerCase() === wanted) ?? null
}

const STORAGE_SYSTEM_PROMPT =
  'You say how a household grocery item is kept at home. ' +
  'You only ever choose from the list given. Always reply with strict JSON only.'

/** The sentinel for "I can't say", the same first-class decline sections get. */
export const NO_STORAGE_TYPE = 'unknown'

/**
 * Unlike tags and sections this schema is a constant, because the choices are.
 * `as const` and no builder: there is no household data to compile in.
 */
const STORAGE_FORMAT = {
  type: 'object',
  properties: { storageType: { enum: [...STORAGE_TYPES, NO_STORAGE_TYPE] } },
  required: ['storageType'],
  additionalProperties: false,
} as const

/**
 * Build the storage prompt for one item name. Pure.
 *
 * Each choice is described rather than just named: "fresh" and "chilled" are not
 * self-evident words, and the gloss is what stops a model treating them as
 * interchangeable. The exactly-one rule is stated too, but it is the grammar that
 * enforces it — the sentence is a courtesy, not the constraint (§10 Phase 15).
 */
export function buildStoragePrompt(itemName: string): string {
  return [
    `How is the grocery item "${itemName}" kept at home?`,
    '',
    'Available answers:',
    '- FRESH: eaten within days, kept out of the fridge (fruit, veg, bread)',
    '- CHILLED: kept in the fridge (milk, cheese, raw meat)',
    '- FROZEN: kept in the freezer',
    '- AMBIENT: shelf-stable at room temperature (tins, dry goods, jars)',
    '',
    'Rules:',
    '- Choose exactly one. Answer for how the item is usually bought.',
    `- Reply {"storageType":"${NO_STORAGE_TYPE}"} if you cannot say.`,
    '- Reply as {"storageType":"CHILLED"}.',
  ].join('\n')
}

/**
 * Parse a storage reply into one of the four types, or null when the model
 * declined or answered unusably. Case-insensitive, so a model that lower-cases
 * the enum still resolves. Pure.
 */
export function parseSuggestedStorageType(content: string): StorageType | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const choice = (parsed as { storageType?: unknown }).storageType
  if (typeof choice !== 'string') return null
  const wanted = choice.trim().toUpperCase()
  return STORAGE_TYPES.find((type) => type === wanted) ?? null
}

const CANONICAL_SYSTEM_PROMPT =
  'You convert branded supermarket product names into the generic name a ' +
  'shopping list would use. Always reply with strict JSON only.'

const CANONICAL_FORMAT = {
  type: 'object',
  properties: { canonicalName: { type: 'string' } },
  required: ['canonicalName'],
  additionalProperties: false,
} as const

/** Build the canonicalisation prompt for one product name. Pure. */
export function buildCanonicalPrompt(productName: string): string {
  return [
    `Give the generic shopping name for this product: "${productName}"`,
    '',
    'Rules:',
    '- Drop the brand, the pack size and any marketing words.',
    '- Keep the distinction a shopper actually cares about ("semi skimmed milk",',
    '  "smoked streaky bacon"), but not the packaging ("500ml bottle").',
    '- Singular, lower case, no punctuation.',
    '- Reply as {"canonicalName":"semi skimmed milk"}.',
  ].join('\n')
}

/** Parse a canonicalisation reply. Null unless it is a usable name. Pure. */
export function parseCanonicalName(content: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const name = (parsed as { canonicalName?: unknown }).canonicalName
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  // A model that echoes the whole packet name has not canonicalised anything,
  // and an empty answer is not one either.
  return trimmed && trimmed.length <= 80 ? trimmed : null
}

/**
 * Parse the model's JSON reply into ingredient overrides. Tolerant: returns an
 * empty array (caller keeps the fallback) when the JSON is malformed or the
 * shape is wrong, rather than throwing. Pure.
 */
export function parseLlmResponse(content: string): LlmIngredient[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }
  const list =
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { ingredients?: unknown }).ingredients)
      ? (parsed as { ingredients: unknown[] }).ingredients
      : Array.isArray(parsed)
        ? parsed
        : []

  const out: LlmIngredient[] = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    if (typeof o.index !== 'number') continue
    out.push({
      index: o.index,
      canonicalName: typeof o.canonicalName === 'string' ? o.canonicalName.trim() : undefined,
      quantity: numberOrNull(o.quantity),
      unit: stringOrNull(o.unit),
      baseUnit: isBaseUnit(o.baseUnit) ? o.baseUnit : undefined,
      isStaple: typeof o.isStaple === 'boolean' ? o.isStaple : undefined,
      typicalUnitGrams: positiveOrNull(o.typicalUnitGrams),
    })
  }
  return out
}

/** Merge a single LLM override onto a fallback line, keeping its raw text. */
function applyOverride(
  line: NormalisedIngredient,
  override: LlmIngredient | undefined,
): NormalisedIngredient {
  if (!override) return line
  const canonicalName = override.canonicalName || line.canonicalName
  if (!canonicalName) return line
  const unit = override.unit !== undefined ? override.unit : line.unit
  // The deterministic parser is authoritative for explicit quantities — only let
  // the model override with a real number, never null one out. When a line ends
  // up with a unit but no count ("coriander leaves, to serve" → "unit"), default
  // to 1 so it can still be totalled rather than dropped.
  const quantity =
    override.quantity != null ? override.quantity : (line.quantity ?? (unit ? 1 : null))
  return {
    raw: line.raw,
    canonicalName,
    quantity,
    unit,
    notes: line.notes,
    baseUnit: (isBaseUnit(override.baseUnit) ? override.baseUnit : null) ?? line.baseUnit,
    isStaple: override.isStaple ?? line.isStaple,
    typicalUnitGrams:
      override.typicalUnitGrams != null ? override.typicalUnitGrams : line.typicalUnitGrams,
    source: 'LLM',
  }
}

/** Probe an Ollama server's `/api/tags`, returning the models it reports. */
export async function fetchOllamaModels(url: string): Promise<string[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`${trimSlash(url)}/api/tags`, { signal: controller.signal })
    if (!res.ok) throw new Error(`Ollama responded ${res.status}`)
    const body = (await res.json()) as { models?: { name?: unknown }[] }
    return (body.models ?? [])
      .map((m) => (typeof m.name === 'string' ? m.name : null))
      .filter((n): n is string => Boolean(n))
  } finally {
    clearTimeout(timeout)
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/** Budget for one batch call, scaled by list length and capped. Pure. */
export function timeoutFor(lineCount: number): number {
  return Math.min(TIMEOUT_BASE_MS + lineCount * TIMEOUT_PER_LINE_MS, TIMEOUT_MAX_MS)
}

/** Turn an Ollama error response into a human-readable reason, reading its body. */
async function describeOllamaError(res: Response, model: string): Promise<string> {
  let detail = ''
  try {
    const text = await res.text()
    const parsed = JSON.parse(text) as { error?: unknown }
    detail = typeof parsed.error === 'string' ? parsed.error : text
  } catch {
    // body wasn't JSON; leave detail empty
  }
  // A 404 from /api/chat almost always means the model isn't pulled.
  if (res.status === 404) {
    return detail || `model "${model}" not found — run: ollama pull ${model}`
  }
  return detail ? `HTTP ${res.status}: ${detail}` : `HTTP ${res.status}`
}

function describe(strategy: NormaliserStrategy): string {
  return strategy === 'DICTIONARY' ? 'dictionary' : 'basic parser'
}

function isBaseUnit(value: unknown): value is (typeof BASE_UNITS)[number] {
  return typeof value === 'string' && (BASE_UNITS as readonly string[]).includes(value)
}

function numberOrNull(value: unknown): number | null | undefined {
  if (value === null) return null
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function positiveOrNull(value: unknown): number | null | undefined {
  if (value === null) return null
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function stringOrNull(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' ? value.trim() || null : undefined
}

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

function toTrimmedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v): v is string => v.length > 0)
}
