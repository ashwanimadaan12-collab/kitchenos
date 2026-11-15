import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import type { Env } from "../config/env.schema.js";
import { AuthModule } from "../auth/auth.module.js";
import { KdsController } from "./kds.controller.js";
import { KdsService } from "./kds.service.js";
import { KdsGateway } from "./kds.gateway.js";

@Module({
  imports: [
    AuthModule,
    // Registered again here (also done in AuthModule) so KdsGateway can verify a socket's JWT
    // itself — JwtModule isn't re-exported by AuthModule, and that's the only piece of it this
    // needs, so re-registering the same small async factory is simpler than widening AuthModule's
    // exports for one consumer.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get("JWT_ACCESS_SECRET", { infer: true }),
      }),
    }),
  ],
  controllers: [KdsController],
  providers: [KdsService, KdsGateway],
  exports: [KdsService],
})
export class KdsModule {}
