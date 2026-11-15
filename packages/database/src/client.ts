import { PrismaClient } from "../generated/client/index.js";

declare global {
  // eslint-disable-next-line no-var
  var __kitchenosPrisma: PrismaClient | undefined;
}

/**
 * Single PrismaClient instance per process. In dev, Next.js hot reload would
 * otherwise create a new client (and new connection pool) on every edit.
 */
export const prisma: PrismaClient =
  globalThis.__kitchenosPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__kitchenosPrisma = prisma;
}

/** Thin re-exportable wrapper so NestJS modules can inject it like a service. */
export class PrismaService extends PrismaClient {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
