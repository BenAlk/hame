-- CreateEnum
CREATE TYPE "CalendarSourceType" AS ENUM ('ICAL', 'HOME_ASSISTANT');

-- CreateTable
CREATE TABLE "CalendarSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CalendarSourceType" NOT NULL DEFAULT 'ICAL',
    "url" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncedEvent" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SyncedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncedEvent_sourceId_externalId_key" ON "SyncedEvent"("sourceId", "externalId");

-- AddForeignKey
ALTER TABLE "SyncedEvent" ADD CONSTRAINT "SyncedEvent_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CalendarSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
