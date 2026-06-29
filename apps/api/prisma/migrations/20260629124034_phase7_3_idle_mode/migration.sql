-- CreateTable
CREATE TABLE "ImmichConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "url" TEXT,
    "apiKey" TEXT,
    "selectedAlbumIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastConnectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImmichConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdleModeSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "activationMinutes" INTEGER NOT NULL DEFAULT 5,
    "photoDisplaySeconds" INTEGER NOT NULL DEFAULT 30,
    "clockDisplaySeconds" INTEGER NOT NULL DEFAULT 120,
    "shufflePhotos" BOOLEAN NOT NULL DEFAULT true,
    "showWeatherInClockMode" BOOLEAN NOT NULL DEFAULT true,
    "immichEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdleModeSettings_pkey" PRIMARY KEY ("id")
);
