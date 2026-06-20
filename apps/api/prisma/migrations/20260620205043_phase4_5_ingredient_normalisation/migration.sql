-- CreateEnum
CREATE TYPE "NormaliserStrategy" AS ENUM ('BASIC', 'DICTIONARY', 'LLM');

-- AlterTable
ALTER TABLE "HouseholdSettings" ADD COLUMN     "ingredientNormaliser" "NormaliserStrategy" NOT NULL DEFAULT 'BASIC';

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "typicalUnitGrams" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "OllamaConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "url" TEXT,
    "model" TEXT NOT NULL DEFAULT 'llama3.1',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastConnectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OllamaConfig_pkey" PRIMARY KEY ("id")
);
