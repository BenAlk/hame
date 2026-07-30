import type { SuggestedTags, Tag } from '@hame/shared'

/**
 * Tag pool helpers for the item-tag editor (spec §12 LLM auto-tagging).
 *
 * Tags are compared **case-insensitively** throughout: the pool is a shared
 * household vocabulary, so "Dairy" and "dairy" must never become two tags. The
 * API takes the same view — a suggested tag is mapped back to the pool's own
 * spelling server-side — and these helpers keep the client from offering to
 * create a duplicate the server would then have to reject.
 */
export function normaliseTagName(name: string): string {
  return name.trim().toLowerCase()
}

/** The pool tag matching `name` exactly (ignoring case and surrounding space). */
export function findTagByName(pool: Tag[], name: string): Tag | undefined {
  const wanted = normaliseTagName(name)
  return wanted ? pool.find((tag) => normaliseTagName(tag.name) === wanted) : undefined
}

/**
 * Pool tags to offer for `query`, excluding ones already on the item — an
 * applied tag in the dropdown is a dead option. An empty query lists the whole
 * remaining pool, so the control doubles as a browse affordance.
 */
export function filterTagPool(pool: Tag[], applied: Tag[], query: string): Tag[] {
  const appliedIds = new Set(applied.map((tag) => tag.id))
  const needle = normaliseTagName(query)
  return pool.filter(
    (tag) =>
      !appliedIds.has(tag.id) && (needle === '' || normaliseTagName(tag.name).includes(needle)),
  )
}

/**
 * Whether typing `query` should offer to create a new tag. Only when it names
 * something the pool doesn't already have — otherwise the offer would grow the
 * near-duplicate the enum-constrained suggestion endpoint exists to prevent.
 */
export function canCreateTag(pool: Tag[], query: string): boolean {
  return normaliseTagName(query).length > 0 && !findTagByName(pool, query)
}

/** Suggested tags worth showing as chips: those not already on the item. */
export function unappliedSuggestions(suggested: Tag[], applied: Tag[]): Tag[] {
  const appliedIds = new Set(applied.map((tag) => tag.id))
  return suggested.filter((tag) => !appliedIds.has(tag.id))
}

/**
 * The line to show after a suggestion request, or `null` when there are fresh
 * chips to show instead.
 *
 * The endpoint returns `UNAVAILABLE` for two different situations — no model
 * configured, and an empty tag pool — because the server has no reason to care
 * which. The client does: one is a settings trip, the other is "make a tag
 * first", and telling someone the wrong one sends them to the wrong place. The
 * pool is already loaded here, so the two are separable client-side.
 */
export function suggestionNote(
  result: SuggestedTags,
  opts: { poolEmpty: boolean; freshCount: number },
): string | null {
  if (opts.freshCount > 0) return null
  if (result.source === 'UNAVAILABLE') {
    return opts.poolEmpty
      ? 'No tags to choose from yet — add one first, and suggestions can pick from it.'
      : 'No language model configured. Set one up under Settings → Ingredient normalisation.'
  }
  // A call that never completed, most often a cold model still loading. Saying
  // "no suggestions" here would report an answer that was never given.
  if (result.source === 'FAILED') {
    return 'The model didn’t answer in time — it may still be loading. Try again in a moment.'
  }
  return result.tags.length > 0
    ? 'Those tags are already on this item.'
    : 'The model had no suggestions for that name.'
}

/** Whether two tag sets hold the same tags, order-insensitively. */
export function sameTagSet(a: Tag[], b: Tag[]): boolean {
  if (a.length !== b.length) return false
  const ids = new Set(a.map((tag) => tag.id))
  return b.every((tag) => ids.has(tag.id))
}
