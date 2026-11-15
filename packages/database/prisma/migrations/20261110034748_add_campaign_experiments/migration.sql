-- AlterTable
ALTER TABLE "campaign_variants" ADD COLUMN     "isControl" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "templateId" DROP NOT NULL;
