-- Phase 21: Alert break-through (spec §8.13).
--
-- Opt-in, per recipient: a household alert may briefly lift this phone's Do Not
-- Disturb, ringer mode and volume so an ordinary notification is audible, then
-- put every one of them back. Defaults to false because it writes settings on
-- someone else's device — an existing household stays on the plain critical push
-- until each member turns it on for their own phone.

ALTER TABLE "NotificationPreference"
    ADD COLUMN "alertBreakThrough" BOOLEAN NOT NULL DEFAULT false;
