import { Module } from "@nestjs/common";
import { CommunicationTemplatesController } from "./communication-templates.controller.js";
import { CommunicationPreferencesController } from "./communication-preferences.controller.js";
import { CommunicationMessagesController } from "./communication-messages.controller.js";
import { CommunicationWebhooksController } from "./communication-webhooks.controller.js";
import { CommunicationsService } from "./communications.service.js";
import { WhatsAppCloudProvider } from "./providers/whatsapp-cloud.provider.js";
import { SmsTwilioProvider } from "./providers/sms-twilio.provider.js";

@Module({
  controllers: [
    CommunicationTemplatesController,
    CommunicationPreferencesController,
    CommunicationMessagesController,
    CommunicationWebhooksController,
  ],
  providers: [CommunicationsService, WhatsAppCloudProvider, SmsTwilioProvider],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
