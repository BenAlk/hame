-- Phase 18: Sections — which part of the shop an item is in (spec §8.3).
--
-- Replaces the old "aisle" tags with a single-valued field carrying a walking
-- order. The backfill below moves every item off its aisle tag and onto the
-- matching section, then retires those tags — but only where nothing else still
-- uses them, since Tag is a pool shared with recipes and chores.

-- ── Schema ───────────────────────────────────────────────────────────────────

CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Section_name_key" ON "Section"("name");
CREATE INDEX "Section_position_idx" ON "Section"("position");

ALTER TABLE "Item" ADD COLUMN "sectionId" TEXT;

ALTER TABLE "Item" ADD CONSTRAINT "Item_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Default sections, in the order you walk a shop ───────────────────────────
-- Position, not name, drives the list order. "Frozen" is created but never
-- backfilled onto anything: `frozen` is a *storage* tag in the seed, and an item
-- can be both frozen and in the meat aisle, so inferring a section from it would
-- fight the aisle tag it also carries.

INSERT INTO "Section" ("id", "name", "colour", "position") VALUES
    (gen_random_uuid()::text, 'Produce',    '#6f8169', 1),
    (gen_random_uuid()::text, 'Bakery',     '#9aa0a6', 2),
    (gen_random_uuid()::text, 'Meat',       '#7d2b3e', 3),
    (gen_random_uuid()::text, 'Fish',       '#2f6fb0', 4),
    (gen_random_uuid()::text, 'Dairy',      '#9aa0a6', 5),
    (gen_random_uuid()::text, 'Frozen',     '#2f6fb0', 6),
    (gen_random_uuid()::text, 'Tinned',     '#9aa0a6', 7),
    (gen_random_uuid()::text, 'Dry goods',  '#857a6c', 8),
    (gen_random_uuid()::text, 'Condiments', '#857a6c', 9),
    (gen_random_uuid()::text, 'Snacks',     '#d16a6a', 10),
    (gen_random_uuid()::text, 'Drinks',     '#d16a6a', 11),
    (gen_random_uuid()::text, 'Household',  '#9aa0a6', 12),
    (gen_random_uuid()::text, 'Pet',        '#9aa0a6', 13);

-- ── Backfill: aisle tag → section ────────────────────────────────────────────
-- An item carrying two aisle tags takes the earliest section in walking order,
-- so the result is deterministic rather than whichever row the planner reached
-- first. `_ItemTags` is Prisma's implicit join: A = Item, B = Tag.

WITH aisle_map ("tag", "section") AS (
    VALUES ('produce', 'Produce'), ('bakery', 'Bakery'), ('meat', 'Meat'),
           ('fish', 'Fish'), ('dairy', 'Dairy'), ('tinned', 'Tinned'),
           ('dry-goods', 'Dry goods'), ('condiments', 'Condiments'),
           ('snacks', 'Snacks'), ('drinks', 'Drinks'),
           ('household', 'Household'), ('pet', 'Pet')
)
UPDATE "Item" i
   SET "sectionId" = chosen."sectionId"
  FROM (
        SELECT it."A" AS "itemId",
               s."id" AS "sectionId",
               ROW_NUMBER() OVER (PARTITION BY it."A" ORDER BY s."position") AS rn
          FROM "_ItemTags" it
          JOIN "Tag" t ON t."id" = it."B"
          JOIN aisle_map m ON m."tag" = t."name"
          JOIN "Section" s ON s."name" = m."section"
       ) chosen
 WHERE chosen."itemId" = i."id" AND chosen.rn = 1;

-- ── Retire the aisle tags ────────────────────────────────────────────────────
-- Detach from items first; then drop the tag only if no recipe, chore or other
-- item still references it. A household that also tagged a *recipe* "dairy"
-- keeps that tag — this migration owns the aisle concept, not the whole word.

DELETE FROM "_ItemTags" it
 USING "Tag" t
 WHERE t."id" = it."B"
   AND t."name" IN ('produce', 'bakery', 'meat', 'fish', 'dairy', 'tinned',
                    'dry-goods', 'condiments', 'snacks', 'drinks', 'household', 'pet');

DELETE FROM "Tag" t
 WHERE t."name" IN ('produce', 'bakery', 'meat', 'fish', 'dairy', 'tinned',
                    'dry-goods', 'condiments', 'snacks', 'drinks', 'household', 'pet')
   AND NOT EXISTS (SELECT 1 FROM "_ItemTags"   x WHERE x."B" = t."id")
   AND NOT EXISTS (SELECT 1 FROM "_RecipeTags" x WHERE x."B" = t."id")
   AND NOT EXISTS (SELECT 1 FROM "_ChoreTags"  x WHERE x."B" = t."id");
