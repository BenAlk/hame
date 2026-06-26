-- Phase 7.1b: smart-home control selection moves from a household singleton to
-- per-owner (one row per user + a single household/tablet row), mirroring
-- DashboardLayout (spec §10 Phase 7.1b).

-- AlterTable
ALTER TABLE "SmartHomeSettings" ADD COLUMN "userId" TEXT;
ALTER TABLE "SmartHomeSettings" ADD COLUMN "isHousehold" BOOLEAN NOT NULL DEFAULT false;
-- `id` is now an app-generated uuid rather than the fixed "singleton".
ALTER TABLE "SmartHomeSettings" ALTER COLUMN "id" DROP DEFAULT;

-- Carry the existing household-wide selection forward as the shared
-- household/tablet row (the wall tablet, spec §8.14), keyed by the same fixed id
-- the dashboard's household row uses.
UPDATE "SmartHomeSettings" SET "id" = 'household', "isHousehold" = true WHERE "id" = 'singleton';

-- CreateIndex
CREATE UNIQUE INDEX "SmartHomeSettings_userId_key" ON "SmartHomeSettings"("userId");

-- AddForeignKey
ALTER TABLE "SmartHomeSettings" ADD CONSTRAINT "SmartHomeSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
