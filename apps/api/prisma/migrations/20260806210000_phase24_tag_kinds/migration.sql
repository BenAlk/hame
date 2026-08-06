-- Phase 24: Tag kinds — what a tag is *for* (spec §10 Phase 24).
--
-- Tag is one pool shared by items, recipes and chores, and nothing on it said
-- what a tag was for. The kind decides which surfaces offer a tag and whether
-- the language model may reach for it.

-- ── Schema ───────────────────────────────────────────────────────────────────

CREATE TYPE "TagKind" AS ENUM ('ITEM', 'RECIPE', 'DIETARY', 'BEHAVIOURAL');

ALTER TABLE "Tag" ADD COLUMN "kind" "TagKind" NOT NULL DEFAULT 'ITEM';

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- By name, from the seed's own starter groups. Everything the lists below don't
-- name keeps the column default, ITEM, and that is not a guess: until this phase
-- the only affordance that could create a tag was the item-tag editor, so any
-- tag a live database holds beyond the seed is necessarily item vocabulary.
--
-- Matched on lower(name) because the seed's spellings are lowercase but the
-- editor takes a name as typed, so a hand-made "Dinner" must land in the same
-- place as the seeded one.

-- Drives the app rather than describing anything: `quick-add` puts an item in the
-- shopping quick-add dropdown (§8.2), which is a household's decision, not a fact
-- about the product.
UPDATE "Tag" SET "kind" = 'BEHAVIOURAL'
 WHERE lower("name") = 'quick-add';

-- A claim about what a product contains. Withheld from the model from here on by
-- kind rather than by the by-name list this replaces.
UPDATE "Tag" SET "kind" = 'DIETARY'
 WHERE lower("name") IN ('vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'healthy');

-- Course & occasion, effort & time, cuisine — the three recipe groups in the seed.
UPDATE "Tag" SET "kind" = 'RECIPE'
 WHERE lower("name") IN ('breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'dessert',
                         'side', 'starter', 'party-food', 'roast-dinner', 'bbq',
                         'quick', 'one-pot', 'slow-cooker', 'batch-cook', 'freezer-friendly',
                         'british', 'italian', 'indian', 'chinese', 'thai', 'mexican');
