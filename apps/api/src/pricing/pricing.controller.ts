import { Body, Controller, Delete, Get, Param, Put } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { PricingService } from "./pricing.service.js";
import { setOutletProductPriceSchema, type SetOutletProductPriceDto } from "./dto/set-outlet-product-price.dto.js";

@Controller({ path: "pricing", version: "1" })
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
  ) {}

  @Get("outlets/:outletId")
  @RequirePermissions(PERMISSIONS.PRICE_VIEW)
  async listForOutlet(@CurrentUser() user: RequestUser, @Param("outletId") outletId: string) {
    return this.pricing.listForOutlet(requireOrganizationId(user), outletId);
  }

  @Put("outlets/:outletId/variants/:variantId")
  @RequirePermissions(PERMISSIONS.PRICE_MANAGE)
  async setPrice(
    @CurrentUser() user: RequestUser,
    @Param("outletId") outletId: string,
    @Param("variantId") variantId: string,
    @Body(new ZodValidationPipe(setOutletProductPriceSchema)) dto: SetOutletProductPriceDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const override = await this.pricing.setPrice(organizationId, outletId, variantId, dto);
    await this.audit.log({
      action: "price.outlet_override.set",
      entityType: "OutletProductPrice",
      entityId: override.id,
      organizationId,
      userId: user.userId,
      metadata: { outletId, variantId, price: dto.price },
    });
    return override;
  }

  @Delete("outlets/:outletId/variants/:variantId")
  @RequirePermissions(PERMISSIONS.PRICE_MANAGE)
  async removePrice(
    @CurrentUser() user: RequestUser,
    @Param("outletId") outletId: string,
    @Param("variantId") variantId: string,
  ) {
    const organizationId = requireOrganizationId(user);
    const result = await this.pricing.removePrice(organizationId, outletId, variantId);
    await this.audit.log({
      action: "price.outlet_override.remove",
      entityType: "OutletProductPrice",
      organizationId,
      userId: user.userId,
      metadata: { outletId, variantId },
    });
    return result;
  }
}
