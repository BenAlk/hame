/**
 * What a tag is *for* (spec §10 Phase 24).
 *
 * `Tag` is one pool shared by `Item`, `Recipe` and `Chore`, which for three
 * phases meant every surface — and the language model — saw all of it. That is
 * how `dinner` came to be a legal answer for a block of cheese, and how the
 * recipe form came to offer `ambient` as something to tag a lasagne with.
 *
 * A kind is not a filing system for its own sake. Each value answers two
 * questions differently: **which surfaces offer it**, and **whether the model may
 * reach for it**. Anything that would not change one of those answers does not
 * earn a kind.
 */
export const TAG_KINDS = ['ITEM', 'RECIPE', 'DIETARY', 'BEHAVIOURAL'] as const
export type TagKind = (typeof TAG_KINDS)[number]

/** The two things a tag can be attached to from a tag-editing surface. */
export const TAG_SURFACES = ['ITEM', 'RECIPE'] as const
export type TagSurface = (typeof TAG_SURFACES)[number]

/**
 * Which kinds each surface offers.
 *
 * `DIETARY` is the one kind on both — a claim about contents describes a product
 * and the dish made from it equally. `BEHAVIOURAL` is item-only because the one
 * member it has, `quick-add`, drives the shopping quick-add dropdown (§8.2).
 */
export const TAG_KINDS_BY_SURFACE: Record<TagSurface, readonly TagKind[]> = {
  ITEM: ['ITEM', 'DIETARY', 'BEHAVIOURAL'],
  RECIPE: ['RECIPE', 'DIETARY'],
}

/**
 * The kinds a language model may choose from when suggesting tags for an item.
 *
 * Deliberately narrower than what the surface offers, and the whole point of the
 * `kind`: only `ITEM` describes what a product *is* in a way that can be inferred
 * from its name. `DIETARY` is withheld because it asserts what a product
 * *contains* — readable off a packet, relied on for medical reasons, and never
 * safely guessed (a real model offered `dairy-free` for Cheddar, §10 Phase 19).
 * `BEHAVIOURAL` is withheld because it is a household's decision about the app,
 * not a fact about the product. `RECIPE` is simply about something else.
 */
export const SUGGESTIBLE_TAG_KINDS: readonly TagKind[] = ['ITEM']

/**
 * The kind a tag created from `surface` gets. Creation infers rather than asks:
 * a taxonomy question in the middle of naming an item would cost the very thing
 * inline creation exists to protect.
 */
export function defaultTagKindFor(surface: TagSurface): TagKind {
  return DEFAULT_KIND_BY_SURFACE[surface]
}

// Held as a map rather than leaning on the two vocabularies happening to share
// spellings today, so a third surface can want a kind that isn't named after it.
const DEFAULT_KIND_BY_SURFACE: Record<TagSurface, TagKind> = { ITEM: 'ITEM', RECIPE: 'RECIPE' }

/** Whether `kind` is offered on `surface`. */
export function isTagKindOffered(kind: TagKind, surface: TagSurface): boolean {
  return TAG_KINDS_BY_SURFACE[surface].includes(kind)
}

/** Whether a language model may suggest a tag of `kind`. */
export function mayModelSuggestTagKind(kind: TagKind): boolean {
  return SUGGESTIBLE_TAG_KINDS.includes(kind)
}

/** The tags of `pool` that `surface` offers, in the order given. */
export function tagsForSurface<T extends { kind: TagKind }>(
  pool: readonly T[],
  surface: TagSurface,
): T[] {
  return pool.filter((tag) => isTagKindOffered(tag.kind, surface))
}

/** How each kind is named and explained wherever one is chosen or shown. */
export const TAG_KIND_LABELS: Record<TagKind, { label: string; description: string }> = {
  ITEM: { label: 'Item', description: 'Describes a product. The only kind suggestions draw on.' },
  RECIPE: { label: 'Recipe', description: 'Describes a dish — course, cuisine, effort, occasion.' },
  DIETARY: {
    label: 'Dietary',
    description: 'A claim about contents. Applied by hand only, never suggested.',
  },
  BEHAVIOURAL: {
    label: 'Behavioural',
    description: 'Drives the app itself, like quick-add. Not a description.',
  },
}
