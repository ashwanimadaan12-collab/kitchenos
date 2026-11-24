-- CreateEnum
CREATE TYPE "AggregatorPlatform" AS ENUM ('ZOMATO', 'SWIGGY', 'OTHER');

-- CreateTable
CREATE TABLE "aggregator_settlements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "outletId" TEXT,
    "platform" "AggregatorPlatform" NOT NULL,
    "fileName" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "grossSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "restaurantDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "platformFees" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxesWithheld" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherAdjustments" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "calculatedNetPayout" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reportedNetPayout" DECIMAL(12,2),
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aggregator_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aggregator_settlement_rows" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3),
    "grossSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "restaurantDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "platformFees" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxesWithheld" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherAdjustments" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reportedNetPayout" DECIMAL(12,2),

    CONSTRAINT "aggregator_settlement_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aggregator_settlements_organizationId_platform_periodStart_idx" ON "aggregator_settlements"("organizationId", "platform", "periodStart");

-- CreateIndex
CREATE INDEX "aggregator_settlement_rows_settlementId_idx" ON "aggregator_settlement_rows"("settlementId");

-- CreateIndex
CREATE INDEX "aggregator_settlement_rows_organizationId_externalOrderId_idx" ON "aggregator_settlement_rows"("organizationId", "externalOrderId");

-- AddForeignKey
ALTER TABLE "aggregator_settlements" ADD CONSTRAINT "aggregator_settlements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregator_settlements" ADD CONSTRAINT "aggregator_settlements_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregator_settlements" ADD CONSTRAINT "aggregator_settlements_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregator_settlement_rows" ADD CONSTRAINT "aggregator_settlement_rows_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "aggregator_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
