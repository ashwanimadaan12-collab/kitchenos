-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARN', 'REDEEM', 'EXPIRE', 'WELCOME_BONUS', 'BIRTHDAY_BONUS', 'REFERRAL_BONUS', 'REDEMPTION_REVERSAL', 'MANUAL_ADJUSTMENT');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "birthday" DATE,
ADD COLUMN     "lastBirthdayBonusAt" TIMESTAMP(3),
ADD COLUMN     "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referralBonusGrantedAt" TIMESTAMP(3),
ADD COLUMN     "referredByCustomerId" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "loyaltyDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LoyaltyTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "orderId" TEXT,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_program_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "earningRate" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "redemptionRatio" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "welcomeBonusPoints" INTEGER NOT NULL DEFAULT 0,
    "referralBonusPoints" INTEGER NOT NULL DEFAULT 0,
    "birthdayBonusPoints" INTEGER NOT NULL DEFAULT 0,
    "pointsExpiryDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_program_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_loyalty_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "earningRate" DECIMAL(6,2),
    "redemptionRatio" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_loyalty_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_tiers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minLifetimePoints" INTEGER NOT NULL,
    "earningMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_redemptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "pointsRedeemed" INTEGER NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_transactions_organizationId_idx" ON "loyalty_transactions"("organizationId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_customerId_createdAt_idx" ON "loyalty_transactions"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "loyalty_transactions_type_expiresAt_idx" ON "loyalty_transactions"("type", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_program_settings_organizationId_key" ON "loyalty_program_settings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "brand_loyalty_rules_brandId_key" ON "brand_loyalty_rules"("brandId");

-- CreateIndex
CREATE INDEX "brand_loyalty_rules_organizationId_idx" ON "brand_loyalty_rules"("organizationId");

-- CreateIndex
CREATE INDEX "loyalty_tiers_organizationId_idx" ON "loyalty_tiers"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_tiers_organizationId_name_key" ON "loyalty_tiers"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_redemptions_orderId_key" ON "loyalty_redemptions"("orderId");

-- CreateIndex
CREATE INDEX "loyalty_redemptions_organizationId_idx" ON "loyalty_redemptions"("organizationId");

-- CreateIndex
CREATE INDEX "customers_referredByCustomerId_idx" ON "customers"("referredByCustomerId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_referredByCustomerId_fkey" FOREIGN KEY ("referredByCustomerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_program_settings" ADD CONSTRAINT "loyalty_program_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_loyalty_rules" ADD CONSTRAINT "brand_loyalty_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_loyalty_rules" ADD CONSTRAINT "brand_loyalty_rules_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_tiers" ADD CONSTRAINT "loyalty_tiers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
