import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("Kitchen display system (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let brandId: string;
  let outletId: string;
  let sandwichVariantId: string;
  let coffeeVariantId: string;
  let grillStationId: string;

  // ids created during the suite, torn down in afterAll so repeat runs stay clean.
  let orderId: string;
  let voidOrderId: string;
  let otherOrgId: string;
  let otherStationId: string;
  let otherTicketId: string;

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

    const outletsRes = await authed("get", "/v1/outlets");
    outletId = outletsRes.body.find((o: { code: string }) => o.code === "OM-SKT-01").id;

    const productsRes = await authed("get", `/v1/products?brandId=${brandId}`);
    const sandwich = productsRes.body.find((p: { sku: string }) => p.sku === "OM-SAND");
    sandwichVariantId = sandwich.variants.find((v: { name: string }) => v.name === "Regular").id;
    const coffee = productsRes.body.find((p: { sku: string }) => p.sku === "OM-COFFEE");
    coffeeVariantId = coffee.variants.find((v: { name: string }) => v.name === "Regular").id;

    const kitchensRes = await authed("get", "/v1/kitchens");
    const oldMonkKitchen = kitchensRes.body.find((k: { code: string }) => k.code === "KOM-01");
    grillStationId = oldMonkKitchen.stations.find((s: { code: string }) => s.code === "GRILL-01").id;

    // A second, fully isolated tenant with its own station and ticket, used
    // only to prove cross-org access is impossible.
    const otherOrg = await prisma.organization.create({
      data: { name: `Other Org ${randomUUID()}`, slug: `other-org-${randomUUID()}` },
    });
    otherOrgId = otherOrg.id;
    const otherBrand = await prisma.brand.create({
      data: { organizationId: otherOrgId, name: "Rival Brand", slug: "rival-brand" },
    });
    const otherOutlet = await prisma.outlet.create({
      data: { organizationId: otherOrgId, brandId: otherBrand.id, name: "Rival Outlet", code: "RIVAL-KDS-OUT-01" },
    });
    const otherKitchen = await prisma.kitchen.create({
      data: { organizationId: otherOrgId, name: "Rival Kitchen", code: "RIVAL-KDS-KTC-01" },
    });
    const otherStation = await prisma.kitchenStation.create({
      data: { kitchenId: otherKitchen.id, name: "Rival Station", code: "RIVAL-KDS-STN-01" },
    });
    otherStationId = otherStation.id;
    const otherCategory = await prisma.productCategory.create({
      data: { organizationId: otherOrgId, brandId: otherBrand.id, name: "Rival Category" },
    });
    const otherProduct = await prisma.product.create({
      data: {
        organizationId: otherOrgId,
        brandId: otherBrand.id,
        categoryId: otherCategory.id,
        name: "Rival Product",
        sku: "RIVAL-KDS-SKU",
        variants: { create: [{ name: "Regular", sku: "RIVAL-KDS-SKU-REG", basePrice: "10.00" }] },
      },
      include: { variants: true },
    });
    const otherVariant = otherProduct.variants[0];
    if (!otherVariant) throw new Error("expected the other org's seed product to have a variant");
    const otherOrder = await prisma.order.create({
      data: {
        organizationId: otherOrgId,
        outletId: otherOutlet.id,
        orderNumber: 1,
        channel: "DINE_IN",
        createdByUserId: (await prisma.user.findFirstOrThrow()).id,
      },
    });
    const otherOrderItem = await prisma.orderItem.create({
      data: {
        orderId: otherOrder.id,
        variantId: otherVariant.id,
        productName: "Rival Product",
        variantName: "Regular",
        unitPrice: "10.00",
        quantity: 1,
        lineSubtotal: "10.00",
        taxAmount: "0.00",
        lineTotal: "10.00",
      },
    });
    const otherTicket = await prisma.kitchenTicketItem.create({
      data: { organizationId: otherOrgId, orderItemId: otherOrderItem.id, stationId: otherStationId },
    });
    otherTicketId = otherTicket.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    if (orderId) await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined);
    if (voidOrderId) await prisma.order.delete({ where: { id: voidOrderId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app.getHttpServer()).get(`/v1/kds/stations/${grillStationId}/tickets`);
    expect(res.status).toBe(401);
  });

  it("routes an item with a recipe station to a kitchen ticket, and skips one without", async () => {
    const createRes = await authed("post", "/v1/orders").send({ outletId, channel: "DINE_IN" });
    orderId = createRes.body.id;

    const addSandwichRes = await authed("post", `/v1/orders/${orderId}/items`).send({
      variantId: sandwichVariantId,
      quantity: 1,
    });
    expect(addSandwichRes.status).toBe(201);

    const addCoffeeRes = await authed("post", `/v1/orders/${orderId}/items`).send({
      variantId: coffeeVariantId,
      quantity: 1,
    });
    expect(addCoffeeRes.status).toBe(201);

    const ticketsRes = await authed("get", `/v1/kds/stations/${grillStationId}/tickets`);
    expect(ticketsRes.status).toBe(200);
    const ourTicket = ticketsRes.body.find(
      (t: { orderItem: { orderId: string } }) => t.orderItem.orderId === orderId,
    );
    expect(ourTicket).toBeDefined();
    expect(ourTicket.status).toBe("QUEUED");
    expect(ourTicket.orderItem.variantId).toBe(sandwichVariantId);

    // Filter Coffee's recipe has no preparation station, so it never gets a ticket.
    expect(
      ticketsRes.body.some((t: { orderItem: { variantId: string } }) => t.orderItem.variantId === coffeeVariantId),
    ).toBe(false);
  });

  it("advances a ticket forward through the lifecycle, refusing to go backward or act on a served ticket", async () => {
    const ticketsRes = await authed("get", `/v1/kds/stations/${grillStationId}/tickets`);
    const ticket = ticketsRes.body.find((t: { orderItem: { orderId: string } }) => t.orderItem.orderId === orderId);

    const startRes = await authed("patch", `/v1/kds/tickets/${ticket.id}/status`).send({ status: "IN_PROGRESS" });
    expect(startRes.status).toBe(200);
    expect(startRes.body.status).toBe("IN_PROGRESS");
    expect(startRes.body.startedAt).not.toBeNull();

    const backwardRes = await authed("patch", `/v1/kds/tickets/${ticket.id}/status`).send({ status: "IN_PROGRESS" });
    expect(backwardRes.status).toBe(400);

    const readyRes = await authed("patch", `/v1/kds/tickets/${ticket.id}/status`).send({ status: "READY" });
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.readyAt).not.toBeNull();

    const servedRes = await authed("patch", `/v1/kds/tickets/${ticket.id}/status`).send({ status: "SERVED" });
    expect(servedRes.status).toBe(200);
    expect(servedRes.body.servedAt).not.toBeNull();

    const afterServedRes = await authed("patch", `/v1/kds/tickets/${ticket.id}/status`).send({ status: "READY" });
    expect(afterServedRes.status).toBe(400);
  });

  it("cancels a ticket when its order item is voided", async () => {
    const createRes = await authed("post", "/v1/orders").send({ outletId, channel: "TAKEAWAY" });
    voidOrderId = createRes.body.id;

    const addRes = await authed("post", `/v1/orders/${voidOrderId}/items`).send({
      variantId: sandwichVariantId,
      quantity: 1,
    });
    const itemId = addRes.body.items[0].id;

    await authed("delete", `/v1/orders/${voidOrderId}/items/${itemId}`);

    const ticketsRes = await authed("get", `/v1/kds/stations/${grillStationId}/tickets`);
    expect(ticketsRes.body.some((t: { orderItem: { id: string } }) => t.orderItem.id === itemId)).toBe(false);

    const cancelledTicket = await prisma.kitchenTicketItem.findFirst({ where: { orderItemId: itemId } });
    expect(cancelledTicket?.status).toBe("CANCELLED");
  });

  it("never lets a station or ticket from another organization be read or advanced", async () => {
    const stationRes = await authed("get", `/v1/kds/stations/${otherStationId}/tickets`);
    expect(stationRes.status).toBe(404);

    const advanceRes = await authed("patch", `/v1/kds/tickets/${otherTicketId}/status`).send({
      status: "IN_PROGRESS",
    });
    expect(advanceRes.status).toBe(404);
  });
});
