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

  private async callOllama(rawLines: string[]): Promise<LlmIngredient[]> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutFor(rawLines.length))
    try {
      const res = await fetch(`${trimSlash(this.settings.url)}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.settings.model,
          format: RESPONSE_FORMAT,
          stream: false,
          options: { temperature: 0, num_ctx: NUM_CTX },
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
