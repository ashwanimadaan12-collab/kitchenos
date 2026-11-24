-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "legalName" TEXT;

-- AlterTable
ALTER TABLE "outlets" ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "fssaiLicence" TEXT;
