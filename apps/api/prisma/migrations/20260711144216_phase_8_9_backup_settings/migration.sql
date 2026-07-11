-- CreateEnum
CREATE TYPE "BackupFrequency" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "BackupRunStatus" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "BackupSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "BackupFrequency" NOT NULL DEFAULT 'DAILY',
    "hour" INTEGER NOT NULL DEFAULT 3,
    "weekday" INTEGER NOT NULL DEFAULT 0,
    "retentionCount" INTEGER NOT NULL DEFAULT 7,
    "passphrase" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" "BackupRunStatus",
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupSettings_pkey" PRIMARY KEY ("id")
);
