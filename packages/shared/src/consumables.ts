/**
 * "Probably due" heuristic and cadence estimation for consumables
 * (spec §8.3, §10 Phase 8.4 / 8.5).
 *
 * A consumable is due for re-order when it has a cadence and at least that many
 * days have passed since it was last bought. The cadence is either **manually
 * typed** (`reorderIntervalDays`, always definitive) or — behind the opt-in Labs
 * toggle (§10 Phase 8.5) — **estimated from purchase history**. Everything here is
 * pure and derived; the estimate is never persisted, so the manual field stays
 * manual-only and turning the toggle off reverts instantly.
 *
 * Elapsed days are counted in **local calendar days**, reduced to a DST-free
 * integer "day ordinal" so the count can't drift by one across a daylight-saving
 * shift — the same pattern as the chore-stats and recurrence day maths.
 */

/** The local calendar day of a timestamp, as a `Date.UTC`-based DST-free ordinal. */
function localDayOrdinal(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
}

interface DueInput {
  reorderIntervalDays: number | null
  /** The cadence actually in force (manual, or auto-applied); wins when present. */
  effectiveIntervalDays?: number | null
  lastBoughtAt: Date | string | null
}

/** Whole calendar days elapsed since a consumable was last bought, or `null` if never. */
export function daysSinceLastBought(
  lastBoughtAt: Date | string | null,
  now: Date = new Date(),
): number | null {
  if (lastBoughtAt == null) return null
  const last = new Date(lastBoughtAt)
  if (Number.isNaN(last.getTime())) return null
  return localDayOrdinal(now) - localDayOrdinal(last)
}

/**
 * True when a consumable is likely due for re-order. Uses the effective cadence
 * (the one in force — manual or auto-applied) when the caller supplies it, else
 * falls back to the raw manual field. Never due without a cadence or a purchase.
 */
export function isConsumableDue(c: DueInput, now: Date = new Date()): boolean {
  const cadence =
    c.effectiveIntervalDays !== undefined ? c.effectiveIntervalDays : c.reorderIntervalDays
  if (cadence == null) return false
  const days = daysSinceLastBought(c.lastBoughtAt, now)
  return days !== null && days >= cadence
}

// ── Cadence estimation (spec §10 Phase 8.5) ──────────────────────────────────

/** The most recent purchases considered when estimating a cadence. */
export const SUGGESTION_WINDOW = 6
/** Minimum purchases before we'll suggest a cadence at all (< 2 intervals is noise). */
export const SUGGEST_MIN_PURCHASES = 3
/** Minimum purchases before a confident suggestion may auto-apply. */
export const AUTO_MIN_PURCHASES = 4
/** Gaps at least this regular (coefficient of variation ≤) may auto-apply. */
export const REGULARITY_MAX_CV = 0.4
/** A suggestion whose ratio to a manual cadence falls outside this band earns a nudge. */
export const DIVERGENCE_LOW = 0.5
export const DIVERGENCE_HIGH = 2

/** The states a consumable's cadence can be in, for UI labelling (§10 Phase 8.5). */
export const CONSUMABLE_CADENCE_STATES = [
  'manual', // a user-typed cadence is in force (definitive)
  'diverged', // manual cadence set, but history suggests a materially different one
  'auto', // no manual cadence; a confident estimate is auto-applied
  'suggested', // no manual cadence; an estimate is offered but not applied
  'none', // no cadence and nothing to suggest
] as const
export type ConsumableCadenceState = (typeof CONSUMABLE_CADENCE_STATES)[number]

export interface ConsumableSuggestion {
  /** Estimated re-order cadence in days (rounded). */
  days: number
  /** How many distinct purchase days informed it, after windowing. */
  purchaseCount: number
  /** Whether it clears the bar to auto-apply (enough, regular purchases). */
  confident: boolean
}

/** Median of a numeric list (the caller passes it already sorted ascending). */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Coefficient of variation (stddev / mean); 0 for a constant series. */
function coefficientOfVariation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / mean
}

/**
 * Estimate a re-order cadence from purchase timestamps, or `null` when there's
 * too little history. Purchases are deduped to calendar days and windowed to the
 * most recent {@link SUGGESTION_WINDOW}; the estimate is the **median** of the
 * consecutive-day gaps (robust to the odd double-buy or long gap). It's marked
 * `confident` — the bar to auto-apply — only with enough, regular purchases.
 */
export function suggestReorderInterval(
  purchaseDates: readonly (Date | string)[],
): ConsumableSuggestion | null {
  const distinct = [
    ...new Set(
      purchaseDates
        .map((d) => new Date(d))
        .filter((d) => !Number.isNaN(d.getTime()))
        .map(localDayOrdinal),
    ),
  ].sort((a, b) => a - b)

  const recent = distinct.slice(-SUGGESTION_WINDOW)
  if (recent.length < SUGGEST_MIN_PURCHASES) return null

  const gaps: number[] = []
  for (let i = 1; i < recent.length; i += 1) gaps.push(recent[i] - recent[i - 1])

  const days = Math.round(median([...gaps].sort((a, b) => a - b)))
  if (days <= 0) return null

  const confident =
    recent.length >= AUTO_MIN_PURCHASES && coefficientOfVariation(gaps) <= REGULARITY_MAX_CV
  return { days, purchaseCount: recent.length, confident }
}

interface CadenceInput {
  manual: number | null
  suggestion: ConsumableSuggestion | null
}

/**
 * The cadence actually in force. A manual value always wins; otherwise, only when
 * the Labs toggle is `enabled` and the estimate is confident does it auto-apply.
 * With `enabled` false this is pure Option-1 "suggest only" — nothing auto-applies.
 */
export function effectiveReorderInterval(input: CadenceInput, enabled: boolean): number | null {
  if (input.manual != null) return input.manual
  if (enabled && input.suggestion?.confident) return input.suggestion.days
  return null
}

/** Whether an estimate diverges materially from a typed cadence (§10 Phase 8.5). */
function isDivergent(manual: number, suggestedDays: number): boolean {
  const ratio = suggestedDays / manual
  return ratio < DIVERGENCE_LOW || ratio > DIVERGENCE_HIGH
}

/**
 * Classify a consumable's cadence for UI labelling. When the Labs toggle is off,
 * a consumable is only ever `manual` or `none` — no suggestions surface.
 */
export function consumableCadenceState(
  input: CadenceInput,
  enabled: boolean,
): ConsumableCadenceState {
  const { manual, suggestion } = input
  if (manual != null) {
    if (enabled && suggestion && isDivergent(manual, suggestion.days)) return 'diverged'
    return 'manual'
  }
  if (!enabled || !suggestion) return 'none'
  return suggestion.confident ? 'auto' : 'suggested'
}
