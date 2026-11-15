-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "preferredSupplierId" TEXT,
ADD COLUMN     "shelfLifeDays" INTEGER;

-- AlterTable
ALTER TABLE "stock_balances" ADD COLUMN     "leadTimeDaysOverride" INTEGER,
ADD COLUMN     "safetyStockOverride" DECIMAL(12,3);

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "leadTimeDays" INTEGER NOT NULL DEFAULT 3;

-- CreateIndex
CREATE INDEX "ingredients_preferredSupplierId_idx" ON "ingredients"("preferredSupplierId");

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
