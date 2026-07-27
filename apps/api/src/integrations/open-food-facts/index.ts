/**
 * Open Food Facts product lookup (spec §10 Phase 14).
 *
 * Turns a never-seen barcode into a product name so a scan can be matched to an
 * existing `Item` instead of typed. Deliberately *not* an `IntegrationProvider`
 * (§9.9): that framework's kinds are `STATUS` and `CALENDAR`, and this is
 * neither — it's a one-shot lookup in the `recipe-import` mould.
 *
 * OFF is free and key-less; in place of an API key it asks callers to identify
 * themselves by User-Agent, and anonymous default-agent traffic is the first
 * thing throttled when the service sheds load. Hence {@link USER_AGENT}.
 *
 * Every failure path returns `null` rather than throwing: a lookup is an
 * accelerator, never a gate. If OFF is down, slow, or has never heard of the
 * product, the scan still works — the name is typed and the code still learned.
 * Only genuinely public URLs are reachable here, so it goes through `safeFetch`
 * (§8.6) with no LAN exemption.
 */
import type { BarcodeSuggestion } from '@hame/shared'
import { safeFetch } from '../../lib/safe-fetch.js'
import { logger } from '../../lib/logger.js'

const API_BASE = 'https://world.openfoodfacts.org/api/v2/product'
const FETCH_TIMEOUT_MS = 5_000
const MAX_JSON_BYTES = 1_000_000

/** Identifies Hame to OFF, per their API policy. */
const USER_AGENT = 'Hame/1.0 (self-hosted household app; https://github.com/topics/self-hosted)'

/** Only the fields we render — asking for less is politer and faster. */
const FIELDS = 'product_name,product_name_en,generic_name,brands,quantity'

interface OffResponse {
  status?: number
  product?: {
    product_name?: unknown
    product_name_en?: unknown
    generic_name?: unknown
    brands?: unknown
    quantity?: unknown
  }
}

/**
 * Map an OFF payload to a suggestion, or `null` when it carries no usable name.
 * Pure and exported for testing — the network half is the trivial part.
 */
export function toSuggestion(body: unknown): BarcodeSuggestion | null {
  const res = body as OffResponse
  if (!res || typeof res !== 'object' || res.status !== 1 || !res.product) return null

  const p = res.product
  // OFF is crowd-sourced, so any field may be absent, blank, or not a string.
  const name = firstString(p.product_name, p.product_name_en, p.generic_name)
  if (!name) return null

  return {
    name,
    // `brands` is a comma-separated list; the first is the one on the packet.
    brand: firstString(p.brands)?.split(',')[0]?.trim() || null,
    quantity: firstString(p.quantity) ?? null,
  }
}

/**
 * Reduce a packet name towards a generic one without asking anything of a
 * model: drop the brand where the name simply repeats it, and drop a trailing
 * pack size, which OFF reports separately anyway. Deliberately conservative —
 * it only removes what it is certain about, so "Tesco British Semi Skimmed
 * Milk" becomes "British Semi Skimmed Milk" rather than guessing further.
 *
 * This is the floor the LLM improves on, and the answer when there is no model.
 * Pure.
 */
export function stripBrand(name: string, brand: string | null): string {
  let out = name.trim()
  if (brand) {
    const escaped = brand.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Only at the ends, where a brand actually sits — never mid-name, or
    // "Tesco" would be cut out of a product genuinely called after it.
    out = out
      .replace(new RegExp(`^${escaped}\\b[\\s'’-]*`, 'i'), '')
      .replace(new RegExp(`[\\s'’-]*\\b${escaped}$`, 'i'), '')
      .trim()
  }
  // A trailing pack size: "2.272L", "500 g", "6 x 330ml".
  out = out.replace(/[\s,]*\b[\d.]+\s*(?:x\s*[\d.]+\s*)?(?:kg|g|mg|l|ml|cl|pk|pack)\b\.?$/i, '')
  return out.trim() || name.trim()
}

/** Look a barcode up. Returns `null` for miss, timeout, or any failure. */
export async function lookupBarcode(code: string): Promise<BarcodeSuggestion | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await safeFetch(`${API_BASE}/${encodeURIComponent(code)}.json?fields=${FIELDS}`, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const text = (await res.text()).slice(0, MAX_JSON_BYTES)
    return toSuggestion(JSON.parse(text))
  } catch (err) {
    logger.warn({ err, code }, 'Barcode lookup failed')
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}
