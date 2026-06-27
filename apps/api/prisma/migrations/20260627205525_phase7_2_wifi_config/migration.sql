-- CreateEnum
CREATE TYPE "WifiSecurity" AS ENUM ('WPA', 'WEP', 'NONE');

-- CreateTable
CREATE TABLE "WifiConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "ssid" TEXT NOT NULL DEFAULT '',
    "password" TEXT,
    "security" "WifiSecurity" NOT NULL DEFAULT 'WPA',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WifiConfig_pkey" PRIMARY KEY ("id")
);
