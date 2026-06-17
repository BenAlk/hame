-- Split `User.name` into `firstName` + `surname`.
-- Add the columns nullable first so existing rows can be backfilled, then
-- enforce NOT NULL and drop the old column.

ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "surname" TEXT;

-- Backfill: everything before the first space becomes the first name, the
-- remainder the surname (empty when the name was a single word).
UPDATE "User"
SET "firstName" = CASE
      WHEN position(' ' IN "name") > 0 THEN split_part("name", ' ', 1)
      ELSE "name"
    END,
    "surname" = CASE
      WHEN position(' ' IN "name") > 0 THEN substring("name" FROM position(' ' IN "name") + 1)
      ELSE ''
    END;

ALTER TABLE "User" ALTER COLUMN "firstName" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "surname" SET NOT NULL;

ALTER TABLE "User" DROP COLUMN "name";
