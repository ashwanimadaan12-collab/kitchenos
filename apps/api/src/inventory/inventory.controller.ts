import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { InventoryService } from "./inventory.service.js";
import { ForecastingService } from "./forecasting.service.js";
import { adjustStockSchema, type AdjustStockDto } from "./dto/adjust-stock.dto.js";
import { setReorderPointSchema, type SetReorderPointDto } from "./dto/set-reorder-point.dto.js";
import { ingredientForecastQuerySchema, type IngredientForecastQueryDto } from "./dto/ingredient-forecast-query.dto.js";
import { productForecastQuerySchema, type ProductForecastQueryDto } from "./dto/product-forecast-query.dto.js";
import { setForecastOverrideSchema, type SetForecastOverrideDto } from "./dto/set-forecast-override.dto.js";

const DEFAULT_HORIZON_DAYS = 14;

@Controller({ path: "inventory", version: "1" })
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly forecasting: ForecastingService,
    private readonly audit: AuditService,
  ) {}

  @Get("kitchens/:kitchenId/stock")
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async listStock(@CurrentUser() user: RequestUser, @Param("kitchenId") kitchenId: string) {
    return this.inventory.listStockForKitchen(requireOrganizationId(user), kitchenId);
  }

  @Get("kitchens/:kitchenId/movements")
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async listMovements(
    @CurrentUser() user: RequestUser,
    @Param("kitchenId") kitchenId: string,
    @Query("ingredientId") ingredientId?: string,
  ) {
    return this.inventory.listMovements(requireOrganizationId(user), kitchenId, ingredientId);
  }

  @Post("kitchens/:kitchenId/adjustments")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  async adjustStock(
    @CurrentUser() user: RequestUser,
    @Param("kitchenId") kitchenId: string,
    @Body(new ZodValidationPipe(adjustStockSchema)) dto: AdjustStockDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const balance = await this.inventory.adjustStock(organizationId, kitchenId, dto);
    await this.audit.log({
      action: `inventory.${dto.type.toLowerCase()}`,
      entityType: "StockBalance",
      entityId: balance.id,
      organizationId,
      userId: user.userId,
      metadata: { kitchenId, ingredientId: dto.ingredientId, quantityDelta: dto.quantityDelta, note: dto.note },
    });
    return balance;
  }

  @Put("kitchens/:kitchenId/reorder-point")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  async setReorderPoint(
    @CurrentUser() user: RequestUser,
    @Param("kitchenId") kitchenId: string,
    @Body(new ZodValidationPipe(setReorderPointSchema)) dto: SetReorderPointDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const balance = await this.inventory.setReorderPoint(organizationId, kitchenId, dto);
    await this.audit.log({
      action: "inventory.reorder_point.set",
      entityType: "StockBalance",
      entityId: balance.id,
      organizationId,
      userId: user.userId,
      metadata: { kitchenId, ingredientId: dto.ingredientId, reorderPoint: dto.reorderPoint },
    });
    return balance;
  }

  @Get("kitchens/:kitchenId/forecast")
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async forecastAllIngredients(
    @CurrentUser() user: RequestUser,
    @Param("kitchenId") kitchenId: string,
    @Query(new ZodValidationPipe(ingredientForecastQuerySchema)) query: IngredientForecastQueryDto,
  ) {
    return this.forecasting.forecastAllIngredients(requireOrganizationId(user), kitchenId, query.horizonDays ?? DEFAULT_HORIZON_DAYS);
  }

  @Get("kitchens/:kitchenId/forecast/:ingredientId")
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async forecastIngredient(
    @CurrentUser() user: RequestUser,
    @Param("kitchenId") kitchenId: string,
    @Param("ingredientId") ingredientId: string,
    @Query(new ZodValidationPipe(ingredientForecastQuerySchema)) query: IngredientForecastQueryDto,
  ) {
    return this.forecasting.forecastIngredient(
      requireOrganizationId(user),
      kitchenId,
      ingredientId,
      query.horizonDays ?? DEFAULT_HORIZON_DAYS,
    );
  }

  @Put("kitchens/:kitchenId/forecast/:ingredientId/override")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  async setForecastOverride(
    @CurrentUser() user: RequestUser,
    @Param("kitchenId") kitchenId: string,
    @Param("ingredientId") ingredientId: string,
    @Body(new ZodValidationPipe(setForecastOverrideSchema)) dto: SetForecastOverrideDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const balance = await this.forecasting.setForecastOverride(organizationId, kitchenId, ingredientId, dto);
    await this.audit.log({
      action: "inventory.forecast_override.set",
      entityType: "StockBalance",
      entityId: balance.id,
      organizationId,
      userId: user.userId,
      metadata: { kitchenId, ingredientId, ...dto },
    });
    return balance;
  }

  @Get("products/:variantId/forecast")
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async forecastProductDemand(
    @CurrentUser() user: RequestUser,
    @Param("variantId") variantId: string,
    @Query(new ZodValidationPipe(productForecastQuerySchema)) query: ProductForecastQueryDto,
  ) {
    return this.forecasting.forecastProductDemand(
      requireOrganizationId(user),
      variantId,
      query.outletId,
      query.horizonDays ?? DEFAULT_HORIZON_DAYS,
    );
  }
}
