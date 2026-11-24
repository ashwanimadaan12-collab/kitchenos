-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'chhota',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);
