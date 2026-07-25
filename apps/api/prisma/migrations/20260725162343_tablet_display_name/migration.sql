-- The wall tablet's `firstName` is now its optional display name (spec §8.1):
-- empty means unnamed, which makes the dashboard greeting drop the name rather
-- than address the furniture ("Good evening, Wall."). Clear the placeholder from
-- an already-provisioned tablet, but only where it is still untouched — a tablet
-- an admin has already named keeps that name.
UPDATE "User"
SET "firstName" = ''
WHERE "role" = 'TABLET'
  AND "firstName" = 'Wall'
  AND "surname" = 'Tablet';
