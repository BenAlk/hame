-- AlterTable
ALTER TABLE "SmartHomeSettings" ADD COLUMN     "knownEntityIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "knownInitialised" BOOLEAN NOT NULL DEFAULT false;
