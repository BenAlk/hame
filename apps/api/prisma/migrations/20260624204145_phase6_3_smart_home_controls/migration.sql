-- CreateTable
CREATE TABLE "SmartHomeSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "entityIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartHomeSettings_pkey" PRIMARY KEY ("id")
);
