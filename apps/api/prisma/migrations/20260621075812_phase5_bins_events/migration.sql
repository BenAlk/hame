-- CreateTable
CREATE TABLE "BinCollection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "icon" TEXT,
    "recurrenceType" "RecurrenceType" NOT NULL,
    "intervalDays" INTEGER,
    "weekdays" "Weekday"[],
    "dayOfMonth" INTEGER,
    "startDate" DATE,
    "remindNightBefore" BOOLEAN NOT NULL DEFAULT true,
    "remindMorningOf" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BinCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "colour" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CustomEvent" ADD CONSTRAINT "CustomEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
