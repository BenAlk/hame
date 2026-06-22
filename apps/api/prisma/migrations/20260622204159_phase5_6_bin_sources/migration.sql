-- CreateEnum
CREATE TYPE "BinSourceType" AS ENUM ('MANUAL', 'ICAL', 'SCRAPER', 'HOME_ASSISTANT');

-- AlterTable
ALTER TABLE "BinCollection" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "sourceConfig" JSONB,
ADD COLUMN     "sourceType" "BinSourceType" NOT NULL DEFAULT 'MANUAL',
ALTER COLUMN "recurrenceType" DROP NOT NULL;

-- CreateTable
CREATE TABLE "BinOccurrence" (
    "id" TEXT NOT NULL,
    "binId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BinOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BinOccurrence_binId_date_key" ON "BinOccurrence"("binId", "date");

-- AddForeignKey
ALTER TABLE "BinOccurrence" ADD CONSTRAINT "BinOccurrence_binId_fkey" FOREIGN KEY ("binId") REFERENCES "BinCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
