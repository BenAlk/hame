/**
 * Recipe URL import (spec §8.5).
 *
 * Fetches a recipe page and parses the schema.org structured data most cooking
 * sites embed in a `<script type="application/ld+json">` block, producing a
 * draft the user reviews/edits before saving. Ingredient strings are split into
 * Item fields by the shared {@link parseIngredientLine} helper.
 *
 * Kept deliberately dependency-free: native `fetch` plus a small JSON-LD
 * extractor, so {@link parseRecipeJsonLd} is unit-testable without the network.
 */
import {
  BasicNormaliser,
  basicLine,
  type DraftIngredient,
  type ImportedRecipeDraft,
  type IngredientNormaliser,
  type NormalisedIngredient,
} from '@hame/shared'
import { HttpError } from '../../lib/http-error.js'
import { safeFetch } from '../../lib/safe-fetch.js'

const FETCH_TIMEOUT_MS = 10_000
const MAX_HTML_BYTES = 5_000_000 // guard against unbounded pages

/**
 * How much readable page text an extractor is given. Sized to leave room for
 * the reply inside the model's context window; {@link toPageText} centres this
 * window on the recipe rather than taking the first N characters, because a
 * food blog's recipe is typically *below* a long personal story.
 */
const MAX_PAGE_CHARS = 8_000

/**
 * The recipe a page yielded, as read rather than as parsed — the shape an
 * {@link RecipeExtractor} returns. Deliberately not a {@link RawRecipe}: an
 * extractor reports only what the page said, while this module owns the source
 * URL and the image, which are recovered deterministically.
 */
export interface ExtractedRecipe {
  title: string
  description: string | null
  servings: number
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  ingredientLines: string[]
  steps: string[]
}

/**
 * Last-resort reader for a page with no structured data. Injected rather than
 * imported so this module stays dependency-free and testable without a model —
 * the API supplies the Ollama-backed one only when the household runs the LLM
 * strategy, so the fallback is opt-in by configuration.
 */
export type RecipeExtractor = (pageText: string) => Promise<ExtractedRecipe | null>

/**
 * Fetch a recipe page and extract a draft, normalising its ingredient lines
 * with the household's configured normaliser (spec §10 Phase 4.5). The draft is
 * returned for the user to review/edit before anything is persisted.
 *
 * Structured data is always tried first: it is exact, instant and free. Only
 * when a page carries none does the optional `extractor` get a chance, so the
 * common path is untouched and the model is never asked to do work a parser
 * already did.
 */
export async function importRecipeFromUrl(
  url: string,
  normaliser: IngredientNormaliser,
  extractor?: RecipeExtractor,
): Promise<ImportedRecipeDraft> {
  const html = await fetchHtml(url)
  const notices: string[] = []

  let raw = extractRawRecipe(html, url)
  if (!raw && extractor) {
    const extracted = await extractor(toPageText(html))
    if (extracted) {
      raw = {
        ...extracted,
        sourceUrl: url,
        imageUrl: extractOgImage(html),
        steps: extracted.steps.map((text) => ({ text })),
      }
      notices.push(
        'This page had no structured recipe data, so the language model read it ' +
          'from the page text — check the ingredients and steps before saving.',
      )
    }
  }
  if (!raw) throw HttpError.badRequest('No recipe data found at that URL')

  const { ingredients, warnings } = await normaliser.normalise(raw.ingredientLines)
  return buildDraft(raw, ingredients, normaliser.strategy, [...notices, ...warnings])
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await safeFetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; HameRecipeImport/1.0)' },
      signal: controller.signal,
    })
    if (!res.ok) throw HttpError.badRequest(`Could not fetch that URL (HTTP ${res.status})`)
    const text = await res.text()
    return text.slice(0, MAX_HTML_BYTES)
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw HttpError.badRequest('Could not fetch that URL')
  } finally {
    clearTimeout(timeout)
  }
}

// ── Parsing (pure) ───────────────────────────────────────────────────────────

interface JsonLdRecipe {
  '@type'?: string | string[]
  name?: string
  description?: string
  image?: unknown
  prepTime?: string
  cookTime?: string
  recipeYield?: unknown
  recipeIngredient?: unknown
  ingredients?: unknown
  recipeInstructions?: unknown
}

/** The recipe metadata + raw ingredient lines pulled from a page, pre-normalisation. */
export interface RawRecipe {
  title: string
  description: string | null
  imageUrl: string | null
  sourceUrl: string
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  servings: number
  ingredientLines: string[]
  steps: { text: string }[]
}

/**
 * Pull the first schema.org Recipe out of a page's JSON-LD as raw metadata plus
 * un-normalised ingredient lines. Returns null when no Recipe node is present.
 * Pure (no network) — exported for unit testing.
 */
export function extractRawRecipe(html: string, sourceUrl: string): RawRecipe | null {
  const recipe = findRecipeNode(html)
  if (!recipe) return null

  return {
    title: typeof recipe.name === 'string' ? recipe.name.trim() : 'Imported recipe',
    description: typeof recipe.description === 'string' ? recipe.description.trim() : null,
    imageUrl: parseImage(recipe.image),
    sourceUrl,
    prepTimeMinutes: parseIsoDuration(recipe.prepTime),
    cookTimeMinutes: parseIsoDuration(recipe.cookTime),
    servings: parseYield(recipe.recipeYield),
    ingredientLines: toStringArray(recipe.recipeIngredient ?? recipe.ingredients).filter((l) =>
      l.trim(),
    ),
    steps: parseInstructions(recipe.recipeInstructions).map((text) => ({ text })),
  }
}

/**
 * Reduce a page to the readable text an extractor sees: markup, scripts, styles
 * and the obvious furniture stripped, entities decoded, whitespace collapsed,
 * then narrowed to {@link MAX_PAGE_CHARS}. Pure — exported for unit testing.
 */
export function toPageText(html: string): string {
  const stripped = html
    // Elements whose *content* is never recipe text.
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Keep block boundaries as newlines so ingredient lines survive as lines.
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  const text = decodeEntities(stripped)
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return focusOnRecipe(text, MAX_PAGE_CHARS)
}

/**
 * Narrow long page text to a window around the recipe. Taking the first N
 * characters would be wrong on the sites this fallback exists for: a food
 * blog's recipe sits *after* several thousand words of story, so a naive
 * truncation reliably keeps the story and drops the recipe. Anchors on the last
 * "ingredients" heading — the last, because a page often mentions the word in
 * its intro or nav long before the recipe card. Pure.
 */
export function focusOnRecipe(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text

  const anchor = text.toLowerCase().lastIndexOf('ingredient')
  if (anchor === -1) return text.slice(0, maxChars)

  // Keep a little ahead of the anchor for the title/yield that precede it,
  // and spend the rest of the budget on what follows (the method).
  const lead = Math.floor(maxChars * 0.15)
  const start = Math.max(0, anchor - lead)
  return text.slice(start, start + maxChars)
}

/** Recover a page's `og:image`, so an extracted draft still gets its photo. */
export function extractOgImage(html: string): string | null {
  const re = /<meta[^>]+(?:property|name)=["']og:image["'][^>]*>/i
  const tag = re.exec(html)?.[0]
  if (!tag) return null
  const content = /content=["']([^"']+)["']/i.exec(tag)?.[1]?.trim()
  return content && /^https?:\/\//i.test(content) ? decodeEntities(content) : null
}

/** Decode the handful of entities that actually appear in recipe text. */
function decodeEntities(text: string): string {
  return text
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&(?:amp|#38);/gi, '&')
    .replace(/&(?:lt|#60);/gi, '<')
    .replace(/&(?:gt|#62);/gi, '>')
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:#39|apos|rsquo|#8217);/gi, "'")
    .replace(/&(?:frac12|#189);/gi, '½')
    .replace(/&(?:frac14|#188);/gi, '¼')
    .replace(/&(?:frac34|#190);/gi, '¾')
    .replace(/&(?:deg|#176);/gi, '°')
}

/** Assemble a review draft from raw metadata + normalised ingredients. */
function buildDraft(
  raw: RawRecipe,
  normalised: NormalisedIngredient[],
  strategy: ImportedRecipeDraft['normaliser'],
  warnings: string[],
): ImportedRecipeDraft {
  const ingredients: DraftIngredient[] = normalised
    .filter((n) => n.canonicalName)
    .map((n) => ({
      itemName: n.canonicalName,
      quantity: n.quantity,
      unit: n.unit,
      notes: n.notes,
      isStaple: n.isStaple,
      baseUnit: n.baseUnit,
      typicalUnitGrams: n.typicalUnitGrams,
      raw: n.raw,
      source: n.source,
    }))
  return {
    title: raw.title,
    description: raw.description,
    imageUrl: raw.imageUrl,
    sourceUrl: raw.sourceUrl,
    prepTimeMinutes: raw.prepTimeMinutes,
    cookTimeMinutes: raw.cookTimeMinutes,
    servings: raw.servings,
    ingredients,
    steps: raw.steps,
    normaliser: strategy,
    warnings,
  }
}

/**
 * Parse a page's JSON-LD into a draft using the always-on Basic normaliser.
 * Convenience for tests/synchronous callers; the live import path uses the
 * configured normaliser via {@link importRecipeFromUrl}.
 */
export function parseRecipeJsonLd(html: string, sourceUrl: string): ImportedRecipeDraft | null {
  const raw = extractRawRecipe(html, sourceUrl)
  if (!raw) return null
  const ingredients = raw.ingredientLines.map((line) => basicLine(line))
  return buildDraft(raw, ingredients, new BasicNormaliser().strategy, [])
}

/** Pull every `<script type="application/ld+json">` block and find a Recipe. */
function findRecipeNode(html: string): JsonLdRecipe | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(match[1].trim())
    } catch {
      continue // skip malformed blocks
    }
    const found = searchForRecipe(parsed)
    if (found) return found
  }
  return null
}

/** Recursively walk a JSON-LD value (object, array, or @graph) for a Recipe. */
function searchForRecipe(node: unknown): JsonLdRecipe | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = searchForRecipe(child)
      if (found) return found
    }
    return null
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (isRecipeType(obj['@type'])) return obj as JsonLdRecipe
    if (Array.isArray(obj['@graph'])) return searchForRecipe(obj['@graph'])
  }
  return null
}

function isRecipeType(type: unknown): boolean {
  if (typeof type === 'string') return type.toLowerCase() === 'recipe'
  if (Array.isArray(type))
    return type.some((t) => typeof t === 'string' && t.toLowerCase() === 'recipe')
  return false
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value === 'string') return [value]
  return []
}

/** schema.org instructions are strings, HowToStep objects, or HowToSections. */
function parseInstructions(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (!Array.isArray(value)) return []
  const steps: string[] = []
  for (const node of value) {
    if (typeof node === 'string') {
      if (node.trim()) steps.push(node.trim())
    } else if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>
      if (Array.isArray(obj.itemListElement)) {
        steps.push(...parseInstructions(obj.itemListElement))
      } else if (typeof obj.text === 'string' && obj.text.trim()) {
        steps.push(obj.text.trim())
      }
    }
  }
  return steps
}

function parseImage(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const first = value[0]
    if (typeof first === 'string') return first
    if (first && typeof first === 'object' && typeof (first as { url?: unknown }).url === 'string')
      return (first as { url: string }).url
  }
  if (value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string')
    return (value as { url: string }).url
  return null
}

/** ISO 8601 duration ("PT1H30M") → whole minutes, or null. */
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value.trim())
  if (!m) return null
  const hours = Number(m[1] ?? 0)
  const minutes = Number(m[2] ?? 0)
  const total = hours * 60 + minutes
  return total > 0 ? total : null
}

/** recipeYield is "4", "4 servings", or an array — pull the first integer. */
function parseYield(value: unknown): number {
  const raw = Array.isArray(value) ? value.find((v) => v != null) : value
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.round(raw))
  if (typeof raw === 'string') {
    const m = /\d+/.exec(raw)
    if (m) return Math.max(1, Number(m[0]))
  }
  return 4
}
