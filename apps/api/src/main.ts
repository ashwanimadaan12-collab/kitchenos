import "reflect-metadata";
import { VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { ConfiguredSocketIoAdapter } from "./common/websocket-adapter.js";
import type { Env } from "./config/env.schema.js";

async function bootstrap() {
  // rawBody: true preserves the raw request bytes alongside the parsed body, needed to verify
  // the WhatsApp (X-Hub-Signature-256) and Twilio (X-Twilio-Signature) webhook signatures,
  // which are computed over the exact bytes sent, not a re-serialization of the parsed object.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.useWebSocketAdapter(new ConfiguredSocketIoAdapter(app));

  const config = app.get(ConfigService<Env, true>);
  app.enableCors({ origin: config.get("CORS_ORIGIN", { infer: true }), credentials: true });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.set("trust proxy", 1);

  const port = config.get("API_PORT", { infer: true });
  await app.listen(port);
  app.get(Logger).log(`KitchenOS API listening on port ${port}`);
}

bootstrap();
