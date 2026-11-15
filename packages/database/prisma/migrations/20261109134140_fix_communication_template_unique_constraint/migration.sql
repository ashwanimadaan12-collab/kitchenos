-- DropIndex
DROP INDEX "communication_templates_organizationId_channel_key_key";

-- CreateIndex
CREATE UNIQUE INDEX "communication_templates_organizationId_brandId_channel_key_key" ON "communication_templates"("organizationId", "brandId", "channel", "key");

