-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('PREPARED_FOOD', 'RETAIL_COMMODITY');

-- CreateEnum
CREATE TYPE "PricingRuleCategory" AS ENUM ('TIME_BASED', 'WEEKEND', 'FESTIVAL', 'CHANNEL', 'OUTLET', 'SCHEDULED_DISCOUNT', 'DEMAND_BASED');

-- CreateEnum
CREATE TYPE "PricingAdjustmentType" AS ENUM ('FIXED_PRICE', 'PERCENT_DISCOUNT', 'FLAT_DISCOUNT', 'PERCENT_SURCHARGE', 'FLAT_SURCHARGE');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "pricingRuleId" TEXT,
ADD COLUMN     "pricingRuleLabel" TEXT;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'PREPARED_FOOD',
ADD COLUMN     "landedCost" DECIMAL(10,2),
ADD COLUMN     "printedMRP" DECIMAL(10,2),
ADD COLUMN     "purchasePrice" DECIMAL(10,2),
ADD COLUMN     "supplierPrice" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "variantId" TEXT,
    "outletId" TEXT,
    "channel" "OrderChannel",
    "category" "PricingRuleCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "startTime" TEXT,
    "endTime" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "adjustmentType" "PricingAdjustmentType" NOT NULL,
    "adjustmentValue" DECIMAL(10,2) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "minimumMarginPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_rules_organizationId_idx" ON "pricing_rules"("organizationId");

-- CreateIndex
CREATE INDEX "pricing_rules_variantId_idx" ON "pricing_rules"("variantId");

-- CreateIndex
CREATE INDEX "pricing_rules_outletId_idx" ON "pricing_rules"("outletId");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_settings_organizationId_key" ON "pricing_settings"("organizationId");

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_settings" ADD CONSTRAINT "pricing_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "pricing_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
