import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("Costing engine (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let brandId: string;
  let categoryId: string;
  let outletId: string;

  // ids created during the suite, torn down in afterAll so repeat runs stay clean.
  let ingredientId: string;
  let productId: string;
  let variantId: string;
  let recipeId: string;
  let overheadId: string;
  let otherOrgId: string;
  let otherVariantId: string;
  let otherIngredientId: string;
  let otherRecipeId: string;
  let otherOutletId: string;

  function authed(method: "get" | "post" | "patch" | "put" | "delete", path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("X-Organization-Id", organizationId);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "admin@demo-restaurants.test", password: "ChangeMe123!" });
    accessToken = loginRes.body.accessToken;

    const orgsRes = await request(app.getHttpServer())
      .get("/v1/organizations")
      .set("Authorization", `Bearer ${accessToken}`);
    organizationId = orgsRes.body[0].id;

    const brandsRes = await authed("get", "/v1/brands");
    const oldMonk = brandsRes.body.find((b: { slug: string }) => b.slug === "cafe-old-monk");
    brandId = oldMonk.id;

    const categoriesRes = await authed("get", `/v1/product-categories?brandId=${brandId}`);
    categoryId = categoriesRes.body[0].id;

    const outletsRes = await authed("get", "/v1/outlets");
    outletId = outletsRes.body.find((o: { brandId: string }) => o.brandId === brandId).id;

    // A second, fully isolated tenant used only to prove cross-org access is impossible.
    const otherOrg = await prisma.organization.create({
      data: { name: `Other Org ${randomUUID()}`, slug: `other-org-${randomUUID()}` },
    });
    otherOrgId = otherOrg.id;
    const otherBrand = await prisma.brand.create({
      data: { organizationId: otherOrgId, name: "Rival Brand", slug: "rival-brand" },
    });
    const otherCategory = await prisma.productCategory.create({
      data: { organizationId: otherOrgId, brandId: otherBrand.id, name: "Rival Category" },
    });
    const otherProduct = await prisma.product.create({
      data: {
        organizationId: otherOrgId,
        brandId: otherBrand.id,
        categoryId: otherCategory.id,
        name: "Rival Product",
        sku: "RIVAL-COST-SKU",
        variants: { create: [{ name: "Regular", sku: "RIVAL-COST-SKU-REG", basePrice: "10.00" }] },
      },
      include: { variants: true },
    });
    const otherVariant = otherProduct.variants[0];
    if (!otherVariant) throw new Error("expected the other org's seed product to have a variant");
    otherVariantId = otherVariant.id;
    const otherIngredient = await prisma.ingredient.create({
      data: { organizationId: otherOrgId, name: "Rival Flour", sku: "RIVAL-COST-FLOUR", unit: "KILOGRAM" },
    });
    otherIngredientId = otherIngredient.id;
    const otherRecipe = await prisma.recipe.create({
      data: { organizationId: otherOrgId, variantId: otherVariantId },
    });
    otherRecipeId = otherRecipe.id;
    const otherOutlet = await prisma.outlet.create({
      data: { organizationId: otherOrgId, brandId: otherBrand.id, name: "Rival Outlet", code: "RIVAL-COST-OUT-01" },
    });
    otherOutletId = otherOutlet.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    if (recipeId) await prisma.recipe.delete({ where: { id: recipeId } }).catch(() => undefined);
    if (productId) await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    if (ingredientId) await prisma.ingredient.delete({ where: { id: ingredientId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app.getHttpServer()).get("/v1/costing/ingredients/x/history");
    expect(res.status).toBe(401);
  });

  it("sets an ingredient cost and logs it in cost history", async () => {
    const createRes = await authed("post", "/v1/ingredients").send({
      name: "Test Costed Flour",
      sku: `TEST-COST-${randomUUID().slice(0, 6).toUpperCase()}`,
      unit: "KILOGRAM",
    });
    expect(createRes.status).toBe(201);
    ingredientId = createRes.body.id;

    const setCostRes = await authed("patch", `/v1/costing/ingredients/${ingredientId}`).send({
      costPerUnit: "50.0000",
    });
    expect(setCostRes.status).toBe(200);
    expect(setCostRes.body.costPerUnit).toBe("50");

    const historyRes = await authed("get", `/v1/costing/ingredients/${ingredientId}/history`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body).toHaveLength(1);
    expect(historyRes.body[0].costPerUnit).toBe("50");

    // A second cost change appends, it does not overwrite.
    await authed("patch", `/v1/costing/ingredients/${ingredientId}`).send({ costPerUnit: "55.0000" });
    const historyRes2 = await authed("get", `/v1/costing/ingredients/${ingredientId}/history`);
    expect(historyRes2.body).toHaveLength(2);
  });

  it("computes a variant's cost from its recipe, including overheads and margin", async () => {
    const productRes = await authed("post", "/v1/products").send({
      brandId,
      categoryId,
      name: "Test Costing Product",
      sku: `TEST-COSTPROD-${randomUUID().slice(0, 6).toUpperCase()}`,
      variants: [
        { name: "Regular", sku: `TEST-COSTPROD-REG-${randomUUID().slice(0, 6).toUpperCase()}`, basePrice: "200.00" },
      ],
    });
    expect(productRes.status).toBe(201);
    productId = productRes.body.id;
    variantId = productRes.body.variants[0].id;

    const recipeRes = await authed("post", "/v1/recipes").send({ variantId });
    expect(recipeRes.status).toBe(201);
    recipeId = recipeRes.body.id;

    // Cost per unit was last set to 55.00; 2kg of flour = 110.00 ingredient cost.
    const addLineRes = await authed("post", `/v1/recipes/${recipeId}/ingredients`).send({
      ingredientId,
      quantity: "2",
    });
    expect(addLineRes.status).toBe(201);

    const overheadRes = await authed("post", `/v1/costing/recipes/${recipeId}/overheads`).send({
      label: "Labor",
      amount: "15.00",
    });
    expect(overheadRes.status).toBe(201);
    overheadId = overheadRes.body.id;

    const costRes = await authed("get", `/v1/costing/variants/${variantId}`);
    expect(costRes.status).toBe(200);
    expect(costRes.body.ingredientCost).toBe("110");
    expect(costRes.body.overheadCost).toBe("15");
    expect(costRes.body.totalCost).toBe("125");
    expect(costRes.body.sellingPrice).toBe("200");
    expect(costRes.body.priceSource).toBe("base_price");
    expect(costRes.body.marginAmount).toBe("75");
    expect(costRes.body.missingCostIngredientIds).toEqual([]);

    const updateOverheadRes = await authed("patch", `/v1/costing/recipes/${recipeId}/overheads/${overheadId}`).send({
      amount: "25.00",
    });
    expect(updateOverheadRes.status).toBe(200);

    const costAfterUpdateRes = await authed("get", `/v1/costing/variants/${variantId}`);
    expect(costAfterUpdateRes.body.overheadCost).toBe("25");
    expect(costAfterUpdateRes.body.totalCost).toBe("135");

    const removeOverheadRes = await authed("delete", `/v1/costing/recipes/${recipeId}/overheads/${overheadId}`);
    expect(removeOverheadRes.status).toBe(200);

    const costAfterRemoveRes = await authed("get", `/v1/costing/variants/${variantId}`);
    expect(costAfterRemoveRes.body.overheadCost).toBe("0");
    expect(costAfterRemoveRes.body.totalCost).toBe("110");
  });

  it("uses an outlet's price override instead of the base price when computing margin", async () => {
    const setPriceRes = await authed("put", `/v1/pricing/outlets/${outletId}/variants/${variantId}`).send({
      price: "250.00",
    });
    expect(setPriceRes.status).toBe(200);

    const costRes = await authed("get", `/v1/costing/variants/${variantId}?outletId=${outletId}`);
    expect(costRes.status).toBe(200);
    expect(costRes.body.sellingPrice).toBe("250");
    expect(costRes.body.priceSource).toBe("outlet_override");

    await authed("delete", `/v1/pricing/outlets/${outletId}/variants/${variantId}`);
  });

  it("never lets an ingredient, recipe, variant, or outlet from another organization be costed", async () => {
    const costIngredientRes = await authed("patch", `/v1/costing/ingredients/${otherIngredientId}`).send({
      costPerUnit: "1.00",
    });
    expect(costIngredientRes.status).toBe(404);

    const overheadRes = await authed("post", `/v1/costing/recipes/${otherRecipeId}/overheads`).send({
      label: "Labor",
      amount: "1.00",
    });
    expect(overheadRes.status).toBe(404);

    const variantCostRes = await authed("get", `/v1/costing/variants/${otherVariantId}`);
    expect(variantCostRes.status).toBe(404);

    const outletCostRes = await authed("get", `/v1/costing/variants/${variantId}?outletId=${otherOutletId}`);
    expect(outletCostRes.status).toBe(404);
  });
});
