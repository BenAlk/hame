-- Phase 25: Storage type stops being a tag (spec §10 Phase 25).
--
-- `fresh` / `chilled` / `frozen` / `ambient` were four tags, which could not say
-- the one thing that matters about them: exactly one applies. A model handed them
-- as a multi-select returned "chilled, frozen" for ice cream, and answered by list
-- position when unsure. They become a single-valued field, and locations declare
-- what they hold so the field actually drives something.

-- ── Schema ───────────────────────────────────────────────────────────────────

CREATE TYPE "StorageType" AS ENUM ('FRESH', 'CHILLED', 'FROZEN', 'AMBIENT');

ALTER TABLE "Item" ADD COLUMN "storageType" "StorageType";
ALTER TABLE "StorageLocation" ADD COLUMN "storageType" "StorageType";

-- ── Backfill: storage tag → Item.storageType ─────────────────────────────────
-- An item carrying more than one storage tag — which the tag pool allowed and
-- this field exists to prevent — takes the coldest, since that is the constraint
-- that actually governs where it must live. `_ItemTags` is Prisma's implicit
-- join: A = Item, B = Tag.

WITH storage_map ("tag", "type", "rank") AS (
    VALUES ('frozen', 'FROZEN', 1), ('chilled', 'CHILLED', 2),
           ('fresh', 'FRESH', 3), ('ambient', 'AMBIENT', 4)
)
UPDATE "Item" i
   SET "storageType" = chosen."type"::"StorageType"
  FROM (
        SELECT it."A" AS "itemId",
               m."type" AS "type",
               ROW_NUMBER() OVER (PARTITION BY it."A" ORDER BY m."rank") AS rn
          FROM "_ItemTags" it
          JOIN "Tag" t ON t."id" = it."B"
          JOIN storage_map m ON m."tag" = lower(t."name")
       ) chosen
 WHERE chosen."itemId" = i."id" AND chosen.rn = 1;

-- ── Backfill: what each location holds ───────────────────────────────────────
-- Guessed from the name, because that is the only evidence a live database has,
-- and every guess is editable on the Pantry page. A location that matches nothing
-- keeps NULL, which simply means "no item defaults here" — the pre-Phase-25
-- behaviour — rather than a wrong destination.

UPDATE "StorageLocation"
   SET "storageType" = CASE
        WHEN "name" ILIKE '%freezer%' THEN 'FROZEN'::"StorageType"
        WHEN "name" ILIKE '%fridge%' OR "name" ILIKE '%refrigerat%' THEN 'CHILLED'::"StorageType"
        WHEN "name" ILIKE '%cupboard%' OR "name" ILIKE '%pantry%'
          OR "name" ILIKE '%larder%'   OR "name" ILIKE '%shelf%' THEN 'AMBIENT'::"StorageType"
        ELSE NULL
       END
 WHERE "storageType" IS NULL;

-- ── Retire the storage tags ──────────────────────────────────────────────────
-- Same contract as Phase 18 retiring the aisle tags: detach from items first,
-- then drop each only where no recipe, chore or other item still references it.
-- A household that tagged a *recipe* "fresh" keeps that tag — this migration owns
-- the storage concept, not the word.

DELETE FROM "_ItemTags" it
 USING "Tag" t
 WHERE t."id" = it."B"
   AND lower(t."name") IN ('fresh', 'chilled', 'frozen', 'ambient');

DELETE FROM "Tag" t
 WHERE lower(t."name") IN ('fresh', 'chilled', 'frozen', 'ambient')
   AND NOT EXISTS (SELECT 1 FROM "_ItemTags"   x WHERE x."B" = t."id")
   AND NOT EXISTS (SELECT 1 FROM "_RecipeTags" x WHERE x."B" = t."id")
   AND NOT EXISTS (SELECT 1 FROM "_ChoreTags"  x WHERE x."B" = t."id");
