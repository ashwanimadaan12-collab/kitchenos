import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("Inventory / procurement (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let brandId: string;
  let warehouseKitchenId: string;
  let oldMonkKitchenId: string;
  let saketOutletId: string;
  let coffeeVariantId: string;

  // ids created during the suite, torn down in afterAll so repeat runs stay clean.
  let supplierId: string;
  let ingredientId: string;
  let poId: string;
  let cancelPoId: string;
  let posOrderId: string;
  let otherOrgId: string;
  let otherKitchenId: string;
  let otherSupplierId: string;
  let otherPoId: string;

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

    const kitchensRes = await authed("get", "/v1/kitchens");
    warehouseKitchenId = kitchensRes.body.find((k: { code: string }) => k.code === "CWH-01").id;
    oldMonkKitchenId = kitchensRes.body.find((k: { code: string }) => k.code === "KOM-01").id;

    const outletsRes = await authed("get", "/v1/outlets");
    saketOutletId = outletsRes.body.find((o: { code: string }) => o.code === "OM-SKT-01").id;

    const productsRes = await authed("get", `/v1/products?brandId=${brandId}`);
    const coffee = productsRes.body.find((p: { sku: string }) => p.sku === "OM-COFFEE");
    coffeeVariantId = coffee.variants.find((v: { name: string }) => v.name === "Regular").id;

    // A second, fully isolated tenant used only to prove cross-org access is impossible.
    const otherOrg = await prisma.organization.create({
      data: { name: `Other Org ${randomUUID()}`, slug: `other-org-${randomUUID()}` },
    });
    otherOrgId = otherOrg.id;
    const otherKitchen = await prisma.kitchen.create({
      data: { organizationId: otherOrgId, name: "Rival Kitchen", code: "RIVAL-INV-KTC-01" },
    });
    otherKitchenId = otherKitchen.id;
    const otherSupplier = await prisma.supplier.create({
      data: { organizationId: otherOrgId, name: "Rival Supplier" },
    });
    otherSupplierId = otherSupplier.id;
    const otherIngredient = await prisma.ingredient.create({
      data: { organizationId: otherOrgId, name: "Rival Ingredient", sku: "RIVAL-INV-ING", unit: "KILOGRAM" },
    });
    const otherPo = await prisma.purchaseOrder.create({
      data: {
        organizationId: otherOrgId,
        supplierId: otherSupplierId,
        kitchenId: otherKitchenId,
        orderNumber: 1,
        createdByUserId: (await prisma.user.findFirstOrThrow()).id,
        items: { create: [{ ingredientId: otherIngredient.id, quantityOrdered: "10", unitCost: "1.00" }] },
      },
    });
    otherPoId = otherPo.id;
  });

  afterAll(async () => {
    // Deleted explicitly first: PurchaseOrder.supplierId is onDelete: Restrict (so a normal, live
    // supplier can never vanish out from under its purchase history), which means the organization's
    // own cascading delete below cannot clear it — the organization delete would otherwise roll back
    // entirely, silently leaving this whole fixture behind.
    if (otherPoId) await prisma.purchaseOrder.delete({ where: { id: otherPoId } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    if (posOrderId) await prisma.order.delete({ where: { id: posOrderId } }).catch(() => undefined);
    if (poId) await prisma.purchaseOrder.delete({ where: { id: poId } }).catch(() => undefined);
    if (cancelPoId) await prisma.purchaseOrder.delete({ where: { id: cancelPoId } }).catch(() => undefined);
    if (ingredientId) await prisma.ingredient.delete({ where: { id: ingredientId } }).catch(() => undefined);
    if (supplierId) await prisma.supplier.delete({ where: { id: supplierId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app.getHttpServer()).get(`/v1/inventory/kitchens/${warehouseKitchenId}/stock`);
    expect(res.status).toBe(401);
  });

  it("creates a supplier and an ingredient to purchase", async () => {
    const supplierRes = await authed("post", "/v1/suppliers").send({ name: `Test Supplier ${randomUUID().slice(0, 6)}` });
    expect(supplierRes.status).toBe(201);
    supplierId = supplierRes.body.id;

    const ingredientRes = await authed("post", "/v1/ingredients").send({
      name: "Test PO Ingredient",
      sku: `TEST-PO-${randomUUID().slice(0, 6).toUpperCase()}`,
      unit: "KILOGRAM",
    });
    expect(ingredientRes.status).toBe(201);
    ingredientId = ingredientRes.body.id;
  });

  it("runs a purchase order through draft → ordered → partially received → received", async () => {
    const createRes = await authed("post", "/v1/purchase-orders").send({
      supplierId,
      kitchenId: warehouseKitchenId,
      items: [{ ingredientId, quantityOrdered: "10", unitCost: "20.0000" }],
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe("DRAFT");
    poId = createRes.body.id;
    const itemId = createRes.body.items[0].id;

    const receiveBeforeSubmitRes = await authed("post", `/v1/purchase-orders/${poId}/items/${itemId}/receive`).send({
      quantity: "5",
    });
    expect(receiveBeforeSubmitRes.status).toBe(409);

    const submitRes = await authed("post", `/v1/purchase-orders/${poId}/submit`);
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.status).toBe("ORDERED");

    const receivePartialRes = await authed("post", `/v1/purchase-orders/${poId}/items/${itemId}/receive`).send({
      quantity: "4",
    });
    expect(receivePartialRes.status).toBe(201);
    expect(receivePartialRes.body.status).toBe("PARTIALLY_RECEIVED");

    const stockAfterPartialRes = await authed("get", `/v1/inventory/kitchens/${warehouseKitchenId}/stock`);
    const balance = stockAfterPartialRes.body.find((b: { ingredientId: string }) => b.ingredientId === ingredientId);
    expect(balance.quantityOnHand).toBe("4");

    const overReceiveRes = await authed("post", `/v1/purchase-orders/${poId}/items/${itemId}/receive`).send({
      quantity: "10",
    });
    expect(overReceiveRes.status).toBe(400);

    const receiveRestRes = await authed("post", `/v1/purchase-orders/${poId}/items/${itemId}/receive`).send({
      quantity: "6",
    });
    expect(receiveRestRes.status).toBe(201);
    expect(receiveRestRes.body.status).toBe("RECEIVED");

    const movementsRes = await authed("get", `/v1/inventory/kitchens/${warehouseKitchenId}/movements?ingredientId=${ingredientId}`);
    expect(movementsRes.body.filter((m: { type: string }) => m.type === "RECEIPT")).toHaveLength(2);
  });

  it("records a wastage adjustment and a reorder point", async () => {
    const wastageRes = await authed("post", `/v1/inventory/kitchens/${warehouseKitchenId}/adjustments`).send({
      ingredientId,
      type: "WASTAGE",
      quantityDelta: "-1",
      note: "Damaged in transit",
    });
    expect(wastageRes.status).toBe(201);
    expect(wastageRes.body.quantityOnHand).toBe("9");

    const reorderRes = await authed("put", `/v1/inventory/kitchens/${warehouseKitchenId}/reorder-point`).send({
      ingredientId,
      reorderPoint: "2",
    });
    expect(reorderRes.status).toBe(200);
    expect(reorderRes.body.reorderPoint).toBe("2");
  });

  it("cancels a purchase order and refuses to receive against or re-cancel it", async () => {
    const createRes = await authed("post", "/v1/purchase-orders").send({
      supplierId,
      kitchenId: warehouseKitchenId,
      items: [{ ingredientId, quantityOrdered: "5", unitCost: "20.0000" }],
    });
    cancelPoId = createRes.body.id;
    const itemId = createRes.body.items[0].id;

    await authed("post", `/v1/purchase-orders/${cancelPoId}/submit`);
    const cancelRes = await authed("post", `/v1/purchase-orders/${cancelPoId}/cancel`);
    expect(cancelRes.status).toBe(201);
    expect(cancelRes.body.status).toBe("CANCELLED");

    const receiveAfterCancelRes = await authed(
      "post",
      `/v1/purchase-orders/${cancelPoId}/items/${itemId}/receive`,
    ).send({ quantity: "1" });
    expect(receiveAfterCancelRes.status).toBe(409);

    const recancelRes = await authed("post", `/v1/purchase-orders/${cancelPoId}/cancel`);
    expect(recancelRes.status).toBe(409);
  });

  it("consumes recipe ingredients from the outlet's primary kitchen when a POS item is sold, and restores them when voided", async () => {
    const ingredients = (await authed("get", "/v1/ingredients")).body;
    const milkIngredientId = ingredients.find((i: { sku: string }) => i.sku === "ING-MILK").id;

    // Top up Old Monk Kitchen's stock for Filter Coffee's ingredients so there is something to deduct from.
    // Assertions below use deltas (never an absolute value), so this test stays correct across repeat runs.
    for (const sku of ["ING-COFFEE", "ING-MILK", "PKG-CUP"]) {
      await authed("post", `/v1/inventory/kitchens/${oldMonkKitchenId}/adjustments`).send({
        ingredientId: ingredients.find((i: { sku: string }) => i.sku === sku).id,
        type: "ADJUSTMENT",
        quantityDelta: "1000",
      });
    }

    const stockBeforeRes = await authed("get", `/v1/inventory/kitchens/${oldMonkKitchenId}/stock`);
    const milkBefore = Number(
      stockBeforeRes.body.find((b: { ingredientId: string }) => b.ingredientId === milkIngredientId).quantityOnHand,
    );

    const orderRes = await authed("post", "/v1/orders").send({ outletId: saketOutletId, channel: "DINE_IN" });
    posOrderId = orderRes.body.id;

    const addItemRes = await authed("post", `/v1/orders/${posOrderId}/items`).send({
      variantId: coffeeVariantId,
      quantity: 1,
    });
    expect(addItemRes.status).toBe(201);
    const itemId = addItemRes.body.items[0].id;

    const stockAfterSaleRes = await authed("get", `/v1/inventory/kitchens/${oldMonkKitchenId}/stock`);
    const milkAfterSale = Number(
      stockAfterSaleRes.body.find((b: { ingredientId: string }) => b.ingredientId === milkIngredientId).quantityOnHand,
    );
    // Filter Coffee's recipe uses 100ml of milk per unit sold.
    expect(milkAfterSale).toBe(milkBefore - 100);

    await authed("delete", `/v1/orders/${posOrderId}/items/${itemId}`);

    const stockAfterVoidRes = await authed("get", `/v1/inventory/kitchens/${oldMonkKitchenId}/stock`);
    const milkAfterVoid = Number(
      stockAfterVoidRes.body.find((b: { ingredientId: string }) => b.ingredientId === milkIngredientId).quantityOnHand,
    );
    expect(milkAfterVoid).toBe(milkBefore);

    // Revert the scaffolding top-up above so this test leaves no net trace on repeat runs.
    for (const sku of ["ING-COFFEE", "ING-MILK", "PKG-CUP"]) {
      await authed("post", `/v1/inventory/kitchens/${oldMonkKitchenId}/adjustments`).send({
        ingredientId: ingredients.find((i: { sku: string }) => i.sku === sku).id,
        type: "ADJUSTMENT",
        quantityDelta: "-1000",
      });
    }
  });

  it("never lets a kitchen, supplier, ingredient, or purchase order from another organization be used or read", async () => {
    const stockRes = await authed("get", `/v1/inventory/kitchens/${otherKitchenId}/stock`);
    expect(stockRes.status).toBe(404);

    const adjustRes = await authed("post", `/v1/inventory/kitchens/${otherKitchenId}/adjustments`).send({
      ingredientId,
      type: "ADJUSTMENT",
      quantityDelta: "1",
    });
    expect(adjustRes.status).toBe(404);

    const crossSupplierRes = await authed("post", "/v1/purchase-orders").send({
      supplierId: otherSupplierId,
      kitchenId: warehouseKitchenId,
      items: [{ ingredientId, quantityOrdered: "1", unitCost: "1.0000" }],
    });
    expect(crossSupplierRes.status).toBe(404);

    const readOtherPoRes = await authed("get", `/v1/purchase-orders/${otherPoId}`);
    expect(readOtherPoRes.status).toBe(404);
  });

  describe("forecasting (Prompt 18)", () => {
    let forecastKitchenId: string;
    let forecastSupplierId: string;
    let forecastIngredientId: string;

    beforeAll(async () => {
      const kitchenRes = await authed("post", "/v1/kitchens").send({
        name: "Forecast Test Kitchen",
        code: `FC-KTC-${randomUUID().slice(0, 6).toUpperCase()}`,
      });
      forecastKitchenId = kitchenRes.body.id;

      const supplierRes = await authed("post", "/v1/suppliers").send({
        name: `Forecast Test Supplier ${randomUUID().slice(0, 6)}`,
        leadTimeDays: 5,
      });
      forecastSupplierId = supplierRes.body.id;

      const ingredientRes = await authed("post", "/v1/ingredients").send({
        name: "Forecast Test Flour",
        sku: `FC-ING-${randomUUID().slice(0, 6).toUpperCase()}`,
        unit: "KILOGRAM",
        preferredSupplierId: forecastSupplierId,
      });
      forecastIngredientId = ingredientRes.body.id;

      // A flat, fully controlled 84-day consumption history — directly via Prisma, since
      // there's no API for backdating ledger entries (and real order traffic would never be
      // this deterministic). 5kg/day gives weekday factor 1 and trend factor 1 everywhere.
      // Starts at 83 days ago (not 84): the service's lookback window is computed from its own
      // "now" at query time, which is always a little later than this fixture's "now" — ending
      // one day short of the boundary keeps every seeded row safely inside that window.
      for (let daysAgo = 83; daysAgo >= 0; daysAgo--) {
        const createdAt = new Date(Date.now() - daysAgo * DAY_MS);
        await prisma.stockMovement.create({
          data: {
            organizationId,
            kitchenId: forecastKitchenId,
            ingredientId: forecastIngredientId,
            type: "CONSUMPTION",
            quantityDelta: "-5",
            createdAt,
          },
        });
      }
      await prisma.stockBalance.create({
        data: { organizationId, kitchenId: forecastKitchenId, ingredientId: forecastIngredientId, quantityOnHand: "35" },
      });
    });

    afterAll(async () => {
      if (forecastIngredientId) {
        await prisma.stockMovement.deleteMany({ where: { ingredientId: forecastIngredientId } });
        await prisma.stockBalance.deleteMany({ where: { ingredientId: forecastIngredientId } });
        await prisma.ingredient.delete({ where: { id: forecastIngredientId } }).catch(() => undefined);
      }
      if (forecastSupplierId) await prisma.supplier.delete({ where: { id: forecastSupplierId } }).catch(() => undefined);
      if (forecastKitchenId) await prisma.kitchen.delete({ where: { id: forecastKitchenId } }).catch(() => undefined);
    });

    it("404s a forecast for a kitchen or ingredient from another organization", async () => {
      const kitchenRes = await authed("get", `/v1/inventory/kitchens/${otherKitchenId}/forecast/${forecastIngredientId}`);
      expect(kitchenRes.status).toBe(404);

      const otherIngredient = await prisma.ingredient.create({
        data: { organizationId: otherOrgId, name: "Rival Flour", sku: "RIVAL-INV-FLOUR", unit: "KILOGRAM" },
      });
      const ingredientRes = await authed("get", `/v1/inventory/kitchens/${forecastKitchenId}/forecast/${otherIngredient.id}`);
      expect(ingredientRes.status).toBe(404);
      await prisma.ingredient.delete({ where: { id: otherIngredient.id } });
    });

    it("computes average daily demand, resolves lead time from the preferred supplier, and gives an explainable breakdown", async () => {
      const res = await authed("get", `/v1/inventory/kitchens/${forecastKitchenId}/forecast/${forecastIngredientId}?horizonDays=14`);
      expect(res.status).toBe(200);
      expect(res.body.averageDailyDemand).toBe("5");
      // 5/day x 14 days on a flat series, x1.1 if this org has a running/upcoming
      // promotion or campaign right now (the seeded org always has evergreen promo codes).
      expect(res.body.forecastDemand).toBe(res.body.promotionUpliftApplied ? "77" : "70");
      expect(res.body.leadTimeDays).toBe(5);
      expect(res.body.leadTimeSource).toBe("preferred_supplier");
      expect(res.body.quantityOnHand).toBe("35");
      expect(res.body.daysOfStockRemaining).toBeCloseTo(7, 5); // 35 / 5.
      expect(Array.isArray(res.body.explanation)).toBe(true);
      expect(res.body.explanation.length).toBeGreaterThan(0);
    });

    it("a manual override wins over the preferred supplier's lead time, and is reflected on the next read", async () => {
      const overrideRes = await authed("put", `/v1/inventory/kitchens/${forecastKitchenId}/forecast/${forecastIngredientId}/override`).send({
        leadTimeDaysOverride: 1,
        safetyStockOverride: "2",
      });
      expect(overrideRes.status).toBe(200);

      const res = await authed("get", `/v1/inventory/kitchens/${forecastKitchenId}/forecast/${forecastIngredientId}`);
      expect(res.body.leadTimeDays).toBe(1);
      expect(res.body.leadTimeSource).toBe("override");
      expect(res.body.safetyStock).toBe("2");
      expect(res.body.safetyStockSource).toBe("override");

      // Clear the override so repeat runs of the previous test stay correct.
      await authed("put", `/v1/inventory/kitchens/${forecastKitchenId}/forecast/${forecastIngredientId}/override`).send({
        leadTimeDaysOverride: null,
        safetyStockOverride: null,
      });
    });

    it("the kitchen-wide forecast dashboard includes this ingredient", async () => {
      const res = await authed("get", `/v1/inventory/kitchens/${forecastKitchenId}/forecast`);
      expect(res.status).toBe(200);
      expect(res.body.some((f: { ingredientId: string }) => f.ingredientId === forecastIngredientId)).toBe(true);
    });

    it("predicts product demand for a real variant without error", async () => {
      const res = await authed("get", `/v1/inventory/products/${coffeeVariantId}/forecast?horizonDays=7`);
      expect(res.status).toBe(200);
      expect(res.body.variantId).toBe(coffeeVariantId);
      expect(res.body.horizonDays).toBe(7);
      expect(Number(res.body.forecastQuantity)).toBeGreaterThanOrEqual(0);
    });
  });
});
