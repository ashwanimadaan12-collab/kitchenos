-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "costPerUnit" DECIMAL(10,4);

-- CreateTable
CREATE TABLE "ingredient_cost_history" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "costPerUnit" DECIMAL(10,4) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_overhead_costs" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_overhead_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingredient_cost_history_ingredientId_effectiveAt_idx" ON "ingredient_cost_history"("ingredientId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_overhead_costs_recipeId_label_key" ON "recipe_overhead_costs"("recipeId", "label");

-- AddForeignKey
ALTER TABLE "ingredient_cost_history" ADD CONSTRAINT "ingredient_cost_history_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_overhead_costs" ADD CONSTRAINT "recipe_overhead_costs_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
