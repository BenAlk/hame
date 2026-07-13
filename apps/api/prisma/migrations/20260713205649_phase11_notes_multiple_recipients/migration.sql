-- QuickNotes: a DIRECT note can now be addressed to several members (spec §8.16).
-- The single `Note.recipientId` becomes a `NoteRecipient` join table; existing
-- direct notes are backfilled into it before the old column is dropped.

-- CreateTable
CREATE TABLE "NoteRecipient" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "NoteRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoteRecipient_userId_idx" ON "NoteRecipient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteRecipient_noteId_userId_key" ON "NoteRecipient"("noteId", "userId");

-- AddForeignKey
ALTER TABLE "NoteRecipient" ADD CONSTRAINT "NoteRecipient_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteRecipient" ADD CONSTRAINT "NoteRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: carry each existing direct note's single recipient into the join table.
INSERT INTO "NoteRecipient" ("id", "noteId", "userId")
SELECT gen_random_uuid(), "id", "recipientId"
FROM "Note"
WHERE "recipientId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Note" DROP CONSTRAINT "Note_recipientId_fkey";

-- DropIndex
DROP INDEX "Note_audience_recipientId_idx";

-- AlterTable
ALTER TABLE "Note" DROP COLUMN "recipientId";

-- CreateIndex
CREATE INDEX "Note_audience_idx" ON "Note"("audience");
