import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import type { Env } from "../config/env.schema.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtAccessStrategy } from "./jwt-access.strategy.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { PermissionsResolverService } from "./permissions-resolver.service.js";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt-access" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get("JWT_ACCESS_SECRET", { infer: true }),
        signOptions: { expiresIn: config.get("JWT_ACCESS_TTL", { infer: true }) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessStrategy, JwtAuthGuard, PermissionsResolverService],
  exports: [AuthService, JwtAuthGuard, PermissionsResolverService],
})
export class AuthModule {}
