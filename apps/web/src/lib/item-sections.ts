import type { SuggestedSection } from '@hame/shared'

/**
 * The line to show after a section suggestion, or `null` when there is a chip to
 * offer instead.
 *
 * Four outcomes hide behind one nullable field, and they need different words.
 * As with tags (see `item-tags.ts`), `UNAVAILABLE` covers both "no model" and
 * "nothing to choose from" because the server has no reason to separate them —
 * one is a settings trip, the other is "make a section first". The two new cases
 * are unique to a single choice: the model **declining** to place an item is a
 * real answer worth reporting, and a suggestion matching what the item already
 * has needs saying so rather than offering a no-op chip.
 */
export function sectionSuggestionNote(
  result: SuggestedSection,
  opts: { poolEmpty: boolean; currentSectionId: string | null },
): string | null {
  if (result.section) {
    return result.section.id === opts.currentSectionId
      ? 'That’s already where this one is filed.'
      : null
  }
  if (result.source === 'UNAVAILABLE') {
    return opts.poolEmpty
      ? 'No sections yet — add one first, and suggestions can pick from it.'
      : 'No language model configured. Set one up under Settings → Ingredient normalisation.'
  }
  // Never "couldn't place it": nothing was decided, and a retry usually works
  // once the model has finished loading.
  if (result.source === 'FAILED') {
    return 'The model didn’t answer in time — it may still be loading. Try again in a moment.'
  }
  return 'The model couldn’t place that one. Pick a section yourself.'
}
