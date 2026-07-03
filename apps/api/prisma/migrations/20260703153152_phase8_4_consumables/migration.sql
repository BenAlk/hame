-- CreateEnum
CREATE TYPE "ShoppingItemSource" AS ENUM ('MANUAL', 'MEAL_PLAN', 'CONSUMABLES', 'ROLLOVER');

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "isConsumable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reorderIntervalDays" INTEGER;

-- AlterTable
ALTER TABLE "ShoppingListItem" ADD COLUMN     "sources" "ShoppingItemSource"[] DEFAULT ARRAY['MANUAL']::"ShoppingItemSource"[];
