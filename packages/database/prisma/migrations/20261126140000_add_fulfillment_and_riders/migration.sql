-- Order fulfillment tracking + delivery riders. Purely additive: every new column is
-- either nullable or has a default, so existing rows stay valid and no backfill is needed.

-- CreateEnum
CREATE TYPE "FulfillmentStage" AS ENUM ('PLACED', 'COOKING', 'READY', 'PICKED_UP', 'COMPLETED');

-- CreateTable
CREATE TABLE "delivery_riders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_riders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_riders_organizationId_idx" ON "delivery_riders"("organizationId");

-- CreateIndex
CREATE INDEX "delivery_riders_outletId_isActive_idx" ON "delivery_riders"("outletId", "isActive");

-- AddForeignKey
ALTER TABLE "delivery_riders" ADD CONSTRAINT "delivery_riders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_riders" ADD CONSTRAINT "delivery_riders_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "fulfillment" "FulfillmentStage" NOT NULL DEFAULT 'PLACED',
ADD COLUMN     "riderId" TEXT,
ADD COLUMN     "cookingStartedAt" TIMESTAMP(3),
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "pickedUpAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "orders_outletId_fulfillment_idx" ON "orders"("outletId", "fulfillment");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "delivery_riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Orders that are already closed were, by definition, handed over long ago. Leaving them
-- at PLACED would fill the tracking board with months of history on day one.
UPDATE "orders" SET "fulfillment" = 'COMPLETED', "completedAt" = "closedAt" WHERE "status" IN ('PAID', 'VOIDED');
