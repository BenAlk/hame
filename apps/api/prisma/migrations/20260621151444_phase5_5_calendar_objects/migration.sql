/*
  Warnings:

  - You are about to drop the `CustomEvent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CustomEvent" DROP CONSTRAINT "CustomEvent_createdById_fkey";

-- DropTable
DROP TABLE "CustomEvent";

-- CreateTable
CREATE TABLE "CalendarObject" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "etag" TEXT NOT NULL,
    "icalRaw" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "colour" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarObject_uid_key" ON "CalendarObject"("uid");

-- AddForeignKey
ALTER TABLE "CalendarObject" ADD CONSTRAINT "CalendarObject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
