-- AlterTable
ALTER TABLE "MealPlanEntry" ADD COLUMN     "isGenerated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "mealTypes" "MealType"[];
