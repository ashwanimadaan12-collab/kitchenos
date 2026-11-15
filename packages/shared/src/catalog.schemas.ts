import { z } from "zod";
import { moneySchema } from "./money.schemas.js";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CODE_RE = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;

export const createBrandSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(60).regex(SLUG_RE, "slug must be lowercase kebab-case"),
  description: z.string().max(500).optional(),
});
export type CreateBrandDto = z.infer<typeof createBrandSchema>;

export const updateBrandSchema = createBrandSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateBrandDto = z.infer<typeof updateBrandSchema>;

export const kitchenKindSchema = z.enum(["PRODUCTION", "CENTRAL_WAREHOUSE"]);

export const createKitchenSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(30).regex(CODE_RE, "code must be uppercase alphanumeric, e.g. KTC-01"),
  kind: kitchenKindSchema.optional(),
});
export type CreateKitchenDto = z.infer<typeof createKitchenSchema>;

export const updateKitchenSchema = createKitchenSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateKitchenDto = z.infer<typeof updateKitchenSchema>;

export const createKitchenStationSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(30).regex(CODE_RE, "code must be uppercase alphanumeric, e.g. GRILL-01"),
});
export type CreateKitchenStationDto = z.infer<typeof createKitchenStationSchema>;

export const updateKitchenStationSchema = createKitchenStationSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateKitchenStationDto = z.infer<typeof updateKitchenStationSchema>;

export const createOutletSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(30).regex(CODE_RE, "code must be uppercase alphanumeric, e.g. OM-CP-01"),
  address: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
});
export type CreateOutletDto = z.infer<typeof createOutletSchema>;

export const updateOutletSchema = createOutletSchema.omit({ brandId: true }).partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateOutletDto = z.infer<typeof updateOutletSchema>;

/** Links a brand to a kitchen, posted at POST /kitchens/:kitchenId/brands. */
export const mapBrandKitchenSchema = z.object({
  brandId: z.string().min(1),
  isPrimary: z.boolean().optional(),
});
export type MapBrandKitchenDto = z.infer<typeof mapBrandKitchenSchema>;

export const mapOutletKitchenSchema = z.object({
  kitchenId: z.string().min(1),
  isPrimary: z.boolean().optional(),
});
export type MapOutletKitchenDto = z.infer<typeof mapOutletKitchenSchema>;

// --- Prompt 03: product / menu / pricing -----------------------------------

const PERCENT_RE = /^\d{1,2}(\.\d{1,2})?$/;
const percentSchema = z.string().regex(PERCENT_RE, "must be a non-negative percentage with up to 2 decimal places");

export const createTaxCategorySchema = z.object({
  name: z.string().min(1).max(60),
  ratePercent: percentSchema,
});
export type CreateTaxCategoryDto = z.infer<typeof createTaxCategorySchema>;

export const updateTaxCategorySchema = createTaxCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateTaxCategoryDto = z.infer<typeof updateTaxCategorySchema>;

export const createProductCategorySchema = z.object({
  brandId: z.string().min(1),
  name: z.string().min(1).max(120),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateProductCategoryDto = z.infer<typeof createProductCategorySchema>;

export const updateProductCategorySchema = createProductCategorySchema
  .omit({ brandId: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateProductCategoryDto = z.infer<typeof updateProductCategorySchema>;

const productKindSchema = z.enum(["PREPARED_FOOD", "RETAIL_COMMODITY"]);

const createVariantInputSchema = z.object({
  name: z.string().min(1).max(60),
  sku: z.string().min(1).max(40),
  basePrice: moneySchema,
  sortOrder: z.number().int().min(0).optional(),
  /** RETAIL_COMMODITY unlocks the cost/MRP fields below and a printed-MRP price ceiling. */
  kind: productKindSchema.optional(),
  purchasePrice: moneySchema.optional(),
  supplierPrice: moneySchema.optional(),
  landedCost: moneySchema.optional(),
  printedMRP: moneySchema.optional(),
});

export const createProductSchema = z.object({
  brandId: z.string().min(1),
  categoryId: z.string().min(1),
  taxCategoryId: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  sku: z.string().min(1).max(40),
  description: z.string().max(500).optional(),
  /** At least one variant is required — every product must be sellable at a price. */
  variants: z.array(createVariantInputSchema).min(1),
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  categoryId: z.string().min(1).optional(),
  taxCategoryId: z.string().min(1).nullable().optional(),
  name: z.string().min(1).max(120).optional(),
  sku: z.string().min(1).max(40).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

export const createProductVariantSchema = createVariantInputSchema;
export type CreateProductVariantDto = z.infer<typeof createProductVariantSchema>;

export const updateProductVariantSchema = createVariantInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateProductVariantDto = z.infer<typeof updateProductVariantSchema>;

export const createMenuSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});
export type CreateMenuDto = z.infer<typeof createMenuSchema>;

export const updateMenuSchema = createMenuSchema.omit({ brandId: true }).partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateMenuDto = z.infer<typeof updateMenuSchema>;

export const addMenuItemSchema = z.object({
  variantId: z.string().min(1),
  sortOrder: z.number().int().min(0).optional(),
  isAvailable: z.boolean().optional(),
});
export type AddMenuItemDto = z.infer<typeof addMenuItemSchema>;

export const menuChannelSchema = z.enum(["ALL", "DINE_IN", "DELIVERY", "TAKEAWAY"]);

export const assignMenuToOutletSchema = z.object({
  outletId: z.string().min(1),
  channel: menuChannelSchema.optional(),
});
export type AssignMenuToOutletDto = z.infer<typeof assignMenuToOutletSchema>;

export const setOutletProductPriceSchema = z.object({
  price: moneySchema,
});
export type SetOutletProductPriceDto = z.infer<typeof setOutletProductPriceSchema>;
