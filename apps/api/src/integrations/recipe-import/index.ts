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
import { parseIngredientLine } from '@hame/shared'
import type { ImportedRecipeDraft } from '@hame/shared'
import { HttpError } from '../../lib/http-error.js'

const FETCH_TIMEOUT_MS = 10_000
const MAX_HTML_BYTES = 5_000_000 // guard against unbounded pages

/** Fetch a recipe page and extract a draft from its schema.org metadata. */
export async function importRecipeFromUrl(url: string): Promise<ImportedRecipeDraft> {
  const html = await fetchHtml(url)
  const draft = parseRecipeJsonLd(html, url)
  if (!draft) throw HttpError.badRequest('No recipe data found at that URL')
  return draft
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
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

/**
 * Parse the first schema.org Recipe found in a page's JSON-LD into a draft.
 * Returns null when no Recipe node is present. Exported for unit testing.
 */
export function parseRecipeJsonLd(html: string, sourceUrl: string): ImportedRecipeDraft | null {
  const recipe = findRecipeNode(html)
  if (!recipe) return null

  const ingredientLines = toStringArray(recipe.recipeIngredient ?? recipe.ingredients)
  const ingredients = ingredientLines
    .map((line) => parseIngredientLine(line))
    .filter((p) => p.itemName)
    .map((p) => ({
      itemName: p.itemName,
      quantity: p.quantity,
      unit: p.unit,
      notes: p.notes,
      // Re-affirm staple if the parsed unit has no base unit to sum against.
      isStaple: p.isStaple,
    }))

  const steps = parseInstructions(recipe.recipeInstructions).map((text) => ({ text }))

  return {
    title: typeof recipe.name === 'string' ? recipe.name.trim() : 'Imported recipe',
    description: typeof recipe.description === 'string' ? recipe.description.trim() : null,
    imageUrl: parseImage(recipe.image),
    sourceUrl,
    prepTimeMinutes: parseIsoDuration(recipe.prepTime),
    cookTimeMinutes: parseIsoDuration(recipe.cookTime),
    servings: parseYield(recipe.recipeYield),
    ingredients,
    steps,
  }
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
