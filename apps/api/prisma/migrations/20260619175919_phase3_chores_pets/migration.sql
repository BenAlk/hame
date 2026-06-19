-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('INTERVAL', 'WEEKLY', 'DATE_OF_MONTH', 'ONE_OFF');

-- CreateEnum
CREATE TYPE "AssignmentMode" AS ENUM ('FIXED', 'ROTATING');

-- CreateEnum
CREATE TYPE "Species" AS ENUM ('DOG', 'CAT', 'BIRD', 'RABBIT', 'OTHER');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "Pet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" "Species" NOT NULL,
    "breed" TEXT,
    "dob" DATE,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chore" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "recurrenceType" "RecurrenceType" NOT NULL,
    "intervalDays" INTEGER,
    "weekdays" "Weekday"[],
    "dayOfMonth" INTEGER,
    "oneOffDate" DATE,
    "assignmentMode" "AssignmentMode" NOT NULL DEFAULT 'FIXED',
    "assignedToId" TEXT,
    "petId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoreInstance" (
    "id" TEXT NOT NULL,
    "choreId" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChoreInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ChoreRotation" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ChoreRotation_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ChoreTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ChoreTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ChoreRotation_B_index" ON "_ChoreRotation"("B");

-- CreateIndex
CREATE INDEX "_ChoreTags_B_index" ON "_ChoreTags"("B");

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreInstance" ADD CONSTRAINT "ChoreInstance_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreInstance" ADD CONSTRAINT "ChoreInstance_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreInstance" ADD CONSTRAINT "ChoreInstance_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChoreRotation" ADD CONSTRAINT "_ChoreRotation_A_fkey" FOREIGN KEY ("A") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChoreRotation" ADD CONSTRAINT "_ChoreRotation_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChoreTags" ADD CONSTRAINT "_ChoreTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChoreTags" ADD CONSTRAINT "_ChoreTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
