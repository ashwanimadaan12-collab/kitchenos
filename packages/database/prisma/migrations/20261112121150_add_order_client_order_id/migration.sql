-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "clientOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_organizationId_clientOrderId_key" ON "orders"("organizationId", "clientOrderId");

