import { Controller, Get, Inject, VERSION_NEUTRAL } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from "@nestjs/terminus";
import { PrismaService } from "@kitchenos/database";
import type Redis from "ioredis";
import { Public } from "../common/decorators/public.decorator.js";
import { REDIS_CLIENT } from "../redis/redis.constants.js";

@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck("database", this.prisma),
      async () => {
        const pong = await this.redis.ping();
        return { redis: { status: pong === "PONG" ? "up" : "down" } };
      },
    ]);
  }
}
