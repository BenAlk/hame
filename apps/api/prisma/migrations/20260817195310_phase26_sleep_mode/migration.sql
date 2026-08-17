-- CreateTable
CREATE TABLE "SleepModeSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startMinutes" INTEGER NOT NULL DEFAULT 1320,
    "endMinutes" INTEGER NOT NULL DEFAULT 420,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SleepModeSettings_pkey" PRIMARY KEY ("id")
);
