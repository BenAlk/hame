/**
 * How an item is kept (spec §8.4, §10 Phase 25).
 *
 * This was four tags until Phase 25, and the tag pool could not say the one thing
 * that matters about it: **exactly one applies**. A model handed the four as a
 * multi-select returned `chilled, frozen` for ice cream, and when unsure simply
 * took whichever it read first — "Semi skimmed milk" came back `ambient` from an
 * alphabetical list and `fresh, chilled` from the same list reversed.
 *
 * Unlike `Section` and `Shop`, this is a **closed, universal** set: a household
 * names its own aisles and shops, but nobody renames "frozen" or reorders it. So
 * it is a constant rather than rows, which also makes it the one constrained-model
 * reply in the project whose enum is the same on every install.
 */
export const STORAGE_TYPES = ['FRESH', 'CHILLED', 'FROZEN', 'AMBIENT'] as const
export type StorageType = (typeof STORAGE_TYPES)[number]

/** How each storage type is named and explained wherever one is chosen or shown. */
export const STORAGE_TYPE_LABELS: Record<StorageType, { label: string; description: string }> = {
  FRESH: { label: 'Fresh', description: 'Eaten soon — fruit, veg, bread on the side.' },
  CHILLED: { label: 'Chilled', description: 'Kept in the fridge.' },
  FROZEN: { label: 'Frozen', description: 'Kept in the freezer.' },
  AMBIENT: { label: 'Ambient', description: 'Shelf-stable at room temperature.' },
}

/**
 * The storage location to default to for an item of `storageType` (§10 Phase 25).
 *
 * Pure, and deliberately conservative — this picks a **default, not a rule**. The
 * select it feeds stays editable, so the worst case is the old behaviour rather
 * than a wrong destination that cannot be corrected.
 *
 * Returns the first location declaring that type, and `null` when the item has no
 * storage type or no location declares it, which is exactly the fall-back to
 * "whatever the caller had". Ties are broken by the order given, so a household
 * with two ambient cupboards gets the same answer every time rather than whichever
 * row the database happened to return first.
 */
export function defaultLocationForStorage<
  T extends { id: string; storageType: StorageType | null },
>(locations: readonly T[], storageType: StorageType | null | undefined): T | null {
  if (!storageType) return null
  return locations.find((location) => location.storageType === storageType) ?? null
}
