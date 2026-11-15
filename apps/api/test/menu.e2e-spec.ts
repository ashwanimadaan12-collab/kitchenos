import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("Catalog: products / menus / pricing (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let brandId: string;
  let outletId: string;

  // ids created during the suite, torn down in afterAll so repeat runs stay clean.
  let taxCategoryId: string;
  let categoryId: string;
  let productId: string;
  let variantId: string;
  let secondVariantId: string;
  let menuId: string;
  let otherOrgId: string;
  let otherBrandId: string;
  let otherCategoryId: string;
  let otherProductId: string;
  let otherVariantId: string;
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

    const outletsRes = await authed("get", "/v1/outlets");
    const outlet = outletsRes.body.find((o: { brandId: string }) => o.brandId === brandId);
    outletId = outlet.id;

    // A second, fully isolated tenant with its own brand/category/product/outlet,
    // used only to prove cross-org access is impossible.
    const otherOrg = await prisma.organization.create({
      data: { name: `Other Org ${randomUUID()}`, slug: `other-org-${randomUUID()}` },
    });
    otherOrgId = otherOrg.id;
    const otherBrand = await prisma.brand.create({
      data: { organizationId: otherOrgId, name: "Rival Brand", slug: "rival-brand" },
    });
    otherBrandId = otherBrand.id;
    const otherCategory = await prisma.productCategory.create({
      data: { organizationId: otherOrgId, brandId: otherBrandId, name: "Rival Category" },
    });
    otherCategoryId = otherCategory.id;
    const otherProduct = await prisma.product.create({
      data: {
        organizationId: otherOrgId,
        brandId: otherBrandId,
        categoryId: otherCategoryId,
        name: "Rival Product",
        sku: "RIVAL-SKU",
        variants: { create: [{ name: "Regular", sku: "RIVAL-SKU-REG", basePrice: "1.00" }] },
      },
      include: { variants: true },
    });
    otherProductId = otherProduct.id;
    const otherVariant = otherProduct.variants[0];
    if (!otherVariant) throw new Error("expected the other org's seed product to have a variant");
    otherVariantId = otherVariant.id;
    const otherOutlet = await prisma.outlet.create({
      data: { organizationId: otherOrgId, brandId: otherBrandId, name: "Rival Outlet", code: "RIVAL-OUT-01" },
    });
    otherOutletId = otherOutlet.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    if (menuId) await prisma.menu.delete({ where: { id: menuId } }).catch(() => undefined);
    if (productId) await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    if (categoryId) await prisma.productCategory.delete({ where: { id: categoryId } }).catch(() => undefined);
    if (taxCategoryId) await prisma.taxCategory.delete({ where: { id: taxCategoryId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app.getHttpServer()).get("/v1/products");
    expect(res.status).toBe(401);
  });

  it("creates a tax category and a product category for the brand", async () => {
    const taxRes = await authed("post", "/v1/tax-categories").send({
      name: `Test GST ${randomUUID().slice(0, 6)}`,
      ratePercent: "12.00",
    });
    expect(taxRes.status).toBe(201);
    taxCategoryId = taxRes.body.id;

    const catRes = await authed("post", "/v1/product-categories").send({ brandId, name: "Test Category" });
    expect(catRes.status).toBe(201);
    categoryId = catRes.body.id;
  });

  it("creates a product with a variant, then adds a second variant", async () => {
    const createRes = await authed("post", "/v1/products").send({
      brandId,
      categoryId,
      taxCategoryId,
      name: "Test Product",
      sku: `TEST-${randomUUID().slice(0, 6).toUpperCase()}`,
      variants: [{ name: "Regular", sku: `TEST-REG-${randomUUID().slice(0, 6).toUpperCase()}`, basePrice: "100.00" }],
    });
    expect(createRes.status).toBe(201);
    productId = createRes.body.id;
    variantId = createRes.body.variants[0].id;

    const variantRes = await authed("post", `/v1/products/${productId}/variants`).send({
      name: "Large",
      sku: `TEST-LRG-${randomUUID().slice(0, 6).toUpperCase()}`,
      basePrice: "150.00",
    });
    expect(variantRes.status).toBe(201);
    secondVariantId = variantRes.body.id;

    const detailRes = await authed("get", `/v1/products/${productId}`);
    expect(detailRes.body.variants).toHaveLength(2);
  });

  it("creates a menu, adds the variants, and assigns it to an outlet", async () => {
    const menuRes = await authed("post", "/v1/menus").send({ brandId, name: `Test Menu ${randomUUID().slice(0, 6)}` });
    expect(menuRes.status).toBe(201);
    menuId = menuRes.body.id;

    const addItemRes = await authed("post", `/v1/menus/${menuId}/items`).send({ variantId });
    expect(addItemRes.status).toBe(201);

    const assignRes = await authed("post", `/v1/menus/${menuId}/outlets`).send({ outletId, channel: "DINE_IN" });
    expect(assignRes.status).toBe(201);
    expect(assignRes.body.outlet.id).toBe(outletId);

    const menuDetail = await authed("get", `/v1/menus/${menuId}`);
    expect(menuDetail.body.items).toHaveLength(1);
    expect(menuDetail.body.outletMenus).toHaveLength(1);

    const removeRes = await authed("delete", `/v1/menus/${menuId}/items/${variantId}`);
    expect(removeRes.status).toBe(200);
  });

  it("sets, lists, and removes an outlet price override", async () => {
    const setRes = await authed("put", `/v1/pricing/outlets/${outletId}/variants/${secondVariantId}`).send({
      price: "175.00",
    });
    expect(setRes.status).toBe(200);
    // Prisma's Decimal serializes without a trailing zero.
    expect(setRes.body.price).toBe("175");

    const listRes = await authed("get", `/v1/pricing/outlets/${outletId}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((p: { variantId: string }) => p.variantId === secondVariantId)).toBe(true);

    const removeRes = await authed("delete", `/v1/pricing/outlets/${outletId}/variants/${secondVariantId}`);
    expect(removeRes.status).toBe(200);
  });

  it("never lets a product, variant, or outlet from another organization be read, built on, or priced", async () => {
    const readRes = await authed("get", `/v1/products/${otherProductId}`);
    expect(readRes.status).toBe(404);

    const categoryRes = await authed("post", "/v1/products").send({
      brandId,
      categoryId: otherCategoryId,
      name: "Should fail",
      sku: "SHOULD-FAIL",
      variants: [{ name: "Regular", sku: "SHOULD-FAIL-REG", basePrice: "1.00" }],
    });
    expect(categoryRes.status).toBe(404);

    const menuItemRes = await authed("post", `/v1/menus/${menuId}/items`).send({ variantId: otherVariantId });
    expect(menuItemRes.status).toBe(404);

    const outletAssignRes = await authed("post", `/v1/menus/${menuId}/outlets`).send({ outletId: otherOutletId });
    expect(outletAssignRes.status).toBe(404);

    const priceRes = await authed("put", `/v1/pricing/outlets/${otherOutletId}/variants/${variantId}`).send({
      price: "1.00",
    });
    expect(priceRes.status).toBe(404);
  });
});
