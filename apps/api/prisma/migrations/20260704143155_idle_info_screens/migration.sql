-- AlterTable
ALTER TABLE "IdleModeSettings" ADD COLUMN     "showBinsInIdle" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showMealsInIdle" BOOLEAN NOT NULL DEFAULT true;
