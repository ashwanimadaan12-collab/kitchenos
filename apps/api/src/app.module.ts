import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "./config/config.module.js";
import type { Env } from "./config/env.schema.js";
import { DatabaseModule } from "./database/database.module.js";
import { RedisModule } from "./redis/redis.module.js";
import { CommonModule } from "./common/common.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { JwtAuthGuard } from "./auth/jwt-auth.guard.js";
import { PermissionsGuard } from "./common/guards/permissions.guard.js";
import { OrganizationsModule } from "./organizations/organizations.module.js";
import { BrandsModule } from "./brands/brands.module.js";
import { KitchensModule } from "./kitchens/kitchens.module.js";
import { OutletsModule } from "./outlets/outlets.module.js";
import { TaxCategoriesModule } from "./tax-categories/tax-categories.module.js";
import { ProductCategoriesModule } from "./product-categories/product-categories.module.js";
import { ProductsModule } from "./products/products.module.js";
import { MenusModule } from "./menus/menus.module.js";
import { CombosModule } from "./combos/combos.module.js";
import { PromotionsModule } from "./promotions/promotions.module.js";
import { PricingModule } from "./pricing/pricing.module.js";
import { IngredientsModule } from "./ingredients/ingredients.module.js";
import { RecipesModule } from "./recipes/recipes.module.js";
import { CostingModule } from "./costing/costing.module.js";
import { KdsModule } from "./kds/kds.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { SuppliersModule } from "./suppliers/suppliers.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";
import { PurchaseOrdersModule } from "./purchase-orders/purchase-orders.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { FinanceModule } from "./finance/finance.module.js";
import { HrModule } from "./hr/hr.module.js";
import { CrmModule } from "./crm/crm.module.js";
import { CommunicationsModule } from "./communications/communications.module.js";
import { LoyaltyModule } from "./loyalty/loyalty.module.js";
import { CampaignsModule } from "./campaigns/campaigns.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { TablesModule } from "./tables/tables.module.js";
import { HealthModule } from "./health/health.module.js";

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          { ttl: config.get("RATE_LIMIT_TTL_MS", { infer: true }), limit: config.get("RATE_LIMIT_MAX", { infer: true }) },
        ],
      }),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        // pino-pretty spawns a worker thread that can't resolve its module path
        // under Jest/ts-jest, so only use it for an actual `nest start` dev run.
        transport:
          process.env.NODE_ENV === "development" && !process.env.JEST_WORKER_ID
            ? { target: "pino-pretty" }
            : undefined,
        redact: ["req.headers.authorization", "req.headers.cookie"],
      },
    }),
    DatabaseModule,
    RedisModule,
    CommonModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    BrandsModule,
    KitchensModule,
    OutletsModule,
    TaxCategoriesModule,
    ProductCategoriesModule,
    ProductsModule,
    MenusModule,
    CombosModule,
    PromotionsModule,
    PricingModule,
    IngredientsModule,
    RecipesModule,
    CostingModule,
    KdsModule,
    OrdersModule,
    SuppliersModule,
    InventoryModule,
    PurchaseOrdersModule,
    ReportsModule,
    FinanceModule,
    HrModule,
    CrmModule,
    CommunicationsModule,
    LoyaltyModule,
    CampaignsModule,
    DashboardModule,
    TablesModule,
    HealthModule,
  ],
  providers: [
    // Order matters: the rate limiter runs first (cheapest check, no DB/JWT work for a throttled
    // request), then JwtAuthGuard resolves req.user, then PermissionsGuard reads it.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
