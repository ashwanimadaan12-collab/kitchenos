import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("Catalog: ingredients / recipes (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let brandId: string;
  let categoryId: string;
  let stationId: string;

  // ids created during the suite, torn down in afterAll so repeat runs stay clean.
  let rawIngredientId: string;
  let packagingIngredientId: string;
  let productId: string;
  let variantId: string;
  let recipeId: string;
  let otherOrgId: string;
  let otherVariantId: string;
  let otherIngredientId: string;
  let otherStationId: string;
  let otherRecipeId: string;

  function authed(method: "get" | "post" | "patch" | "delete", path: string) {
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

    const kitchensRes = await authed("get", "/v1/kitchens");
    const oldMonkKitchen = kitchensRes.body.find((k: { code: string }) => k.code === "KOM-01");
    stationId = oldMonkKitchen.stations.find((s: { code: string }) => s.code === "GRILL-01").id;

    // A second, fully isolated tenant with its own variant/ingredient/station,
    // used only to prove cross-org access is impossible.
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
        sku: "RIVAL-SKU",
        variants: { create: [{ name: "Regular", sku: "RIVAL-SKU-REG", basePrice: "1.00" }] },
      },
      include: { variants: true },
    });
    const otherVariant = otherProduct.variants[0];
    if (!otherVariant) throw new Error("expected the other org's seed product to have a variant");
    otherVariantId = otherVariant.id;
    const otherIngredient = await prisma.ingredient.create({
      data: { organizationId: otherOrgId, name: "Rival Flour", sku: "RIVAL-FLOUR", unit: "KILOGRAM" },
    });
    otherIngredientId = otherIngredient.id;
    const otherKitchen = await prisma.kitchen.create({
      data: { organizationId: otherOrgId, name: "Rival Kitchen", code: "RIVAL-KTC-01" },
    });
    const otherStation = await prisma.kitchenStation.create({
      data: { kitchenId: otherKitchen.id, name: "Rival Station", code: "RIVAL-STN-01" },
    });
    otherStationId = otherStation.id;
    const otherRecipe = await prisma.recipe.create({
      data: { organizationId: otherOrgId, variantId: otherVariantId },
    });
    otherRecipeId = otherRecipe.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    if (recipeId) await prisma.recipe.delete({ where: { id: recipeId } }).catch(() => undefined);
    if (productId) await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    if (rawIngredientId) await prisma.ingredient.delete({ where: { id: rawIngredientId } }).catch(() => undefined);
    if (packagingIngredientId) {
      await prisma.ingredient.delete({ where: { id: packagingIngredientId } }).catch(() => undefined);
    }
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app.getHttpServer()).get("/v1/ingredients");
    expect(res.status).toBe(401);
  });

  it("creates a raw-material and a packaging ingredient, and filters by kind", async () => {
    const rawRes = await authed("post", "/v1/ingredients").send({
      name: "Test Cheese",
      sku: `TEST-CHEESE-${randomUUID().slice(0, 6).toUpperCase()}`,
      unit: "KILOGRAM",
    });
    expect(rawRes.status).toBe(201);
    rawIngredientId = rawRes.body.id;

    const packagingRes = await authed("post", "/v1/ingredients").send({
      name: "Test Box",
      sku: `TEST-BOX-${randomUUID().slice(0, 6).toUpperCase()}`,
      unit: "UNIT",
      kind: "PACKAGING",
    });
    expect(packagingRes.status).toBe(201);
    packagingIngredientId = packagingRes.body.id;

    const packagingListRes = await authed("get", "/v1/ingredients?kind=PACKAGING");
    expect(packagingListRes.status).toBe(200);
    expect(packagingListRes.body.some((i: { id: string }) => i.id === packagingIngredientId)).toBe(true);
    expect(packagingListRes.body.every((i: { kind: string }) => i.kind === "PACKAGING")).toBe(true);
  });

  it("creates a product and variant to attach a recipe to", async () => {
    const res = await authed("post", "/v1/products").send({
      brandId,
      categoryId,
      name: "Test Recipe Product",
      sku: `TEST-RCP-${randomUUID().slice(0, 6).toUpperCase()}`,
      variants: [{ name: "Regular", sku: `TEST-RCP-REG-${randomUUID().slice(0, 6).toUpperCase()}`, basePrice: "50.00" }],
    });
    expect(res.status).toBe(201);
    productId = res.body.id;
    variantId = res.body.variants[0].id;
  });

  it("creates a recipe with a preparation station, adds ingredients, updates and removes a line", async () => {
    const createRes = await authed("post", "/v1/recipes").send({ variantId, preparationStationId: stationId });
    expect(createRes.status).toBe(201);
    recipeId = createRes.body.id;
    expect(createRes.body.preparationStation.id).toBe(stationId);

    // A second recipe for the same variant is rejected — one recipe per variant.
    const dupRes = await authed("post", "/v1/recipes").send({ variantId });
    expect(dupRes.status).toBe(409);

    const addRawRes = await authed("post", `/v1/recipes/${recipeId}/ingredients`).send({
      ingredientId: rawIngredientId,
      quantity: "0.2",
    });
    expect(addRawRes.status).toBe(201);

    const addPackagingRes = await authed("post", `/v1/recipes/${recipeId}/ingredients`).send({
      ingredientId: packagingIngredientId,
      quantity: "1",
    });
    expect(addPackagingRes.status).toBe(201);

    const byVariantRes = await authed("get", `/v1/recipes/by-variant/${variantId}`);
    expect(byVariantRes.status).toBe(200);
    expect(byVariantRes.body.ingredients).toHaveLength(2);

    const updateLineRes = await authed("patch", `/v1/recipes/${recipeId}/ingredients/${rawIngredientId}`).send({
      quantity: "0.25",
    });
    expect(updateLineRes.status).toBe(200);
    expect(updateLineRes.body.quantity).toBe("0.25");

    const removeLineRes = await authed("delete", `/v1/recipes/${recipeId}/ingredients/${packagingIngredientId}`);
    expect(removeLineRes.status).toBe(200);

    const finalRes = await authed("get", `/v1/recipes/${recipeId}`);
    expect(finalRes.body.ingredients).toHaveLength(1);
  });

  it("lists recipes filtered by brand", async () => {
    const res = await authed("get", `/v1/recipes?brandId=${brandId}`);
    expect(res.status).toBe(200);
    expect(res.body.some((r: { id: string }) => r.id === recipeId)).toBe(true);
  });

  it("never lets a variant, station, ingredient, or recipe from another organization be used or read", async () => {
    const crossVariantRes = await authed("post", "/v1/recipes").send({ variantId: otherVariantId });
    expect(crossVariantRes.status).toBe(404);

    const crossStationRes = await authed("post", "/v1/recipes").send({
      variantId,
      preparationStationId: otherStationId,
    });
    expect(crossStationRes.status).toBe(404);

    const crossIngredientRes = await authed("post", `/v1/recipes/${recipeId}/ingredients`).send({
      ingredientId: otherIngredientId,
      quantity: "1",
    });
    expect(crossIngredientRes.status).toBe(404);

    const readOtherRecipeRes = await authed("get", `/v1/recipes/${otherRecipeId}`);
    expect(readOtherRecipeRes.status).toBe(404);
  });
});
