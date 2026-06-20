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
  type IngredientNormaliser,
  type NormalisedIngredient,
  type NormaliseResult,
  type NormaliserStrategy,
} from '@hame/shared'
import { logger } from '../../lib/logger.js'

const OLLAMA_TIMEOUT_MS = 30_000

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
    return { ingredients, warnings: base.warnings }
  }

  private async callOllama(rawLines: string[]): Promise<LlmIngredient[]> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS)
    try {
      const res = await fetch(`${trimSlash(this.settings.url)}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.settings.model,
          format: 'json',
          stream: false,
          options: { temperature: 0 },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildNormalisePrompt(rawLines) },
          ],
        }),
      })
      if (!res.ok) throw new Error(await describeOllamaError(res, this.settings.model))
      const body = (await res.json()) as { message?: { content?: string } }
      return parseLlmResponse(body.message?.content ?? '')
    } finally {
      clearTimeout(timeout)
    }
  }
}

const SYSTEM_PROMPT =
  'You are a culinary data normaliser. You convert messy recipe ingredient lines ' +
  'into clean structured data. Always reply with strict JSON only.'

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
