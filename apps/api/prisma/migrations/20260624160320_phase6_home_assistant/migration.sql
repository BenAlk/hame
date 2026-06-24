-- CreateTable
CREATE TABLE "HomeAssistantConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "url" TEXT,
    "accessToken" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastConnectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeAssistantConfig_pkey" PRIMARY KEY ("id")
);
