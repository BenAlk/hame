import type { StorageType, SuggestedStorageType } from '@hame/shared'
import { STORAGE_TYPE_LABELS } from '@hame/shared'

/**
 * The line to show after a storage suggestion, or `null` when there is a chip to
 * offer instead (spec §10 Phase 25).
 *
 * The sibling of `sectionSuggestionNote`, minus one case. Sections and tags both
 * have to separate "no model configured" from "nothing to choose from", because
 * the server reports one `UNAVAILABLE` for both. Here the choices are a project
 * constant, so the pool cannot be empty and `UNAVAILABLE` has only one meaning —
 * which is why this takes no `poolEmpty`.
 */
export function storageSuggestionNote(
  result: SuggestedStorageType,
  opts: { current: StorageType | null },
): string | null {
  if (result.storageType) {
    return result.storageType === opts.current
      ? `That’s already set to ${STORAGE_TYPE_LABELS[result.storageType].label.toLowerCase()}.`
      : null
  }
  if (result.source === 'UNAVAILABLE') {
    return 'No language model configured. Set one up under Settings → Ingredient normalisation.'
  }
  // Nothing was decided, which is not the model saying it cannot tell.
  if (result.source === 'FAILED') {
    return 'The model didn’t answer in time — it may still be loading. Try again in a moment.'
  }
  return 'The model couldn’t say how that one is kept. Pick it yourself.'
}
