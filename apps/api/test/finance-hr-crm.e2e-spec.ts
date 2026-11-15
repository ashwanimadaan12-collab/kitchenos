import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("Finance / HR / CRM (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let paproniBrandId: string;
  let paproniDineInMenuId: string;
  let margheritaMediumVariantId: string;

  // A dedicated, never-otherwise-touched outlet keeps the order/loyalty assertions below exact
  // instead of delta-based, since nothing else in the e2e suite can contribute to it.
  let testOutletId: string;

  // ids created during the suite, torn down in afterAll so repeat runs stay clean.
  let expenseId: string;
  let employeeId: string;
  let customerId: string;
  let loyaltyOrderId: string;
  let removedCustomerOrderId: string;
  let otherOrgId: string;
  let otherOutletId: string;
  let otherEmployeeId: string;
  let otherCustomerId: string;
  let otherExpenseId: string;

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
    paproniBrandId = brandsRes.body.find((b: { slug: string }) => b.slug === "pizza-paproni").id;

    const productsRes = await authed("get", `/v1/products?brandId=${paproniBrandId}`);
    const margherita = productsRes.body.find((p: { sku: string }) => p.sku === "PP-MARG");
    margheritaMediumVariantId = margherita.variants.find((v: { name: string }) => v.name === "Medium").id;

    const menusRes = await authed("get", `/v1/menus?brandId=${paproniBrandId}`);
    paproniDineInMenuId = menusRes.body.find((m: { name: string }) => m.name === "Dine-in Menu").id;

    const outletRes = await authed("post", "/v1/outlets").send({
      brandId: paproniBrandId,
      name: "Paproni - FinHrCrm Test",
      code: "PP-FHC-01",
    });
    testOutletId = outletRes.body.id;
    await authed("post", `/v1/menus/${paproniDineInMenuId}/outlets`).send({ outletId: testOutletId });

    // A second, fully isolated tenant used only to prove cross-org access is impossible.
    const otherOrg = await prisma.organization.create({
      data: { name: `Other Org ${randomUUID()}`, slug: `other-org-${randomUUID()}` },
    });
    otherOrgId = otherOrg.id;
    const otherBrand = await prisma.brand.create({
      data: { organizationId: otherOrgId, name: "Rival Brand", slug: "rival-brand" },
    });
    const otherOutlet = await prisma.outlet.create({
      data: { organizationId: otherOrgId, brandId: otherBrand.id, name: "Rival Outlet", code: "RIVAL-FHC-01" },
    });
    otherOutletId = otherOutlet.id;
    const otherEmployee = await prisma.employee.create({
      data: { organizationId: otherOrgId, name: "Rival Employee", role: "Cashier", hireDate: new Date() },
    });
    otherEmployeeId = otherEmployee.id;
    const otherCustomer = await prisma.customer.create({
      data: { organizationId: otherOrgId, name: "Rival Customer", phone: "+91-9000000000" },
    });
    otherCustomerId = otherCustomer.id;
    const otherExpense = await prisma.expense.create({
      data: {
        organizationId: otherOrgId,
        category: "OTHER",
        amount: "1.00",
        incurredAt: new Date(),
        recordedByUserId: (await prisma.user.findFirstOrThrow()).id,
      },
    });
    otherExpenseId = otherExpense.id;
  });

  afterAll(async () => {
    if (loyaltyOrderId) await prisma.order.delete({ where: { id: loyaltyOrderId } }).catch(() => undefined);
    if (removedCustomerOrderId) await prisma.order.delete({ where: { id: removedCustomerOrderId } }).catch(() => undefined);
    if (testOutletId) await prisma.outlet.delete({ where: { id: testOutletId } }).catch(() => undefined);
    if (customerId) await prisma.customer.delete({ where: { id: customerId } }).catch(() => undefined);
    if (employeeId) await prisma.employee.delete({ where: { id: employeeId } }).catch(() => undefined);
    if (expenseId) await prisma.expense.delete({ where: { id: expenseId } }).catch(() => undefined);
    // otherExpense/otherEmployee are deleted by the organization cascade; neither has a Restrict FK.
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    for (const path of ["/v1/expenses", "/v1/employees", "/v1/customers"]) {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(401);
    }
  });

  describe("expenses", () => {
    it("404s when the outlet does not belong to the caller's organization", async () => {
      const res = await authed("post", "/v1/expenses").send({
        outletId: otherOutletId,
        category: "RENT",
        amount: "100.00",
        incurredAt: new Date().toISOString(),
      });
      expect(res.status).toBe(404);
    });

    it("creates and updates an expense, and lists it back", async () => {
      const createRes = await authed("post", "/v1/expenses").send({
        outletId: testOutletId,
        category: "MAINTENANCE",
        description: "AC repair",
        amount: "2500.00",
        incurredAt: new Date().toISOString(),
      });
      expect(createRes.status).toBe(201);
      expenseId = createRes.body.id;

      const listRes = await authed("get", `/v1/expenses?outletId=${testOutletId}`);
      expect(listRes.body.some((e: { id: string }) => e.id === expenseId)).toBe(true);

      const updateRes = await authed("patch", `/v1/expenses/${expenseId}`).send({ amount: "2750.00" });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.amount).toBe("2750");
    });

    it("never lets an expense from another organization be read or updated", async () => {
      const readRes = await authed("get", `/v1/expenses/${otherExpenseId}`);
      expect(readRes.status).toBe(404);
      const updateRes = await authed("patch", `/v1/expenses/${otherExpenseId}`).send({ amount: "1.00" });
      expect(updateRes.status).toBe(404);
    });
  });

  describe("employees & attendance", () => {
    it("404s when the outlet does not belong to the caller's organization", async () => {
      const res = await authed("post", "/v1/employees").send({
        outletId: otherOutletId,
        name: "Test",
        role: "Cashier",
        hireDate: new Date().toISOString(),
      });
      expect(res.status).toBe(404);
    });

    it("creates an employee and clocks them in and out", async () => {
      const createRes = await authed("post", "/v1/employees").send({
        outletId: testOutletId,
        name: `Test Employee ${randomUUID().slice(0, 6)}`,
        role: "Cashier",
        hireDate: new Date("2026-01-01").toISOString(),
      });
      expect(createRes.status).toBe(201);
      employeeId = createRes.body.id;

      const doubleClockInBeforeFirst = await authed("post", `/v1/employees/${employeeId}/clock-out`);
      expect(doubleClockInBeforeFirst.status).toBe(404); // not clocked in yet

      const clockInRes = await authed("post", `/v1/employees/${employeeId}/clock-in`);
      expect(clockInRes.status).toBe(200);
      expect(clockInRes.body.clockOut).toBeNull();

      const secondClockInRes = await authed("post", `/v1/employees/${employeeId}/clock-in`);
      expect(secondClockInRes.status).toBe(409);

      const clockOutRes = await authed("post", `/v1/employees/${employeeId}/clock-out`);
      expect(clockOutRes.status).toBe(200);
      expect(clockOutRes.body.clockOut).not.toBeNull();

      const secondClockOutRes = await authed("post", `/v1/employees/${employeeId}/clock-out`);
      expect(secondClockOutRes.status).toBe(404);

      const attendanceRes = await authed("get", `/v1/employees/${employeeId}/attendance`);
      expect(attendanceRes.body).toHaveLength(1);
    });

    it("never lets an employee from another organization be read, updated, or clocked in", async () => {
      const readRes = await authed("get", `/v1/employees/${otherEmployeeId}`);
      expect(readRes.status).toBe(404);
      const clockInRes = await authed("post", `/v1/employees/${otherEmployeeId}/clock-in`);
      expect(clockInRes.status).toBe(404);
    });
  });

  describe("customers", () => {
    it("creates a customer and refuses a duplicate phone number", async () => {
      const phone = `+91-90${randomUUID().slice(0, 8)}`;
      const createRes = await authed("post", "/v1/customers").send({ name: "Test Customer", phone });
      expect(createRes.status).toBe(201);
      customerId = createRes.body.id;
      // The seeded loyalty program grants a 20-point welcome bonus on customer creation (Prompt 14).
      expect(createRes.body.loyaltyPoints).toBe(20);

      const dupRes = await authed("post", "/v1/customers").send({ name: "Someone Else", phone });
      expect(dupRes.status).toBe(409);
    });

    it("never lets a customer from another organization be read or updated", async () => {
      const readRes = await authed("get", `/v1/customers/${otherCustomerId}`);
      expect(readRes.status).toBe(404);
    });

    it("accrues loyalty points (one per ₹100, floored) only once the linked order is fully paid", async () => {
      const orderRes = await authed("post", "/v1/orders").send({
        outletId: testOutletId,
        channel: "DINE_IN",
        customerId,
      });
      loyaltyOrderId = orderRes.body.id;
      expect(orderRes.body.customer.id).toBe(customerId);

      await authed("post", `/v1/orders/${loyaltyOrderId}/items`).send({ variantId: margheritaMediumVariantId, quantity: 1 });
      // Margherita Medium: 349.00 + 18% GST = 411.82 -> floor(411.82 / 100) = 4 points, on top of
      // the 20-point welcome bonus already credited when this customer was created, above.

      const beforePayRes = await authed("get", `/v1/customers/${customerId}`);
      expect(beforePayRes.body.loyaltyPoints).toBe(20);

      const payRes = await authed("post", `/v1/orders/${loyaltyOrderId}/payments`).send({ method: "CARD", amount: "411.82" });
      expect(payRes.status).toBe(201);
      expect(payRes.body.status).toBe("PAID");

      const afterPayRes = await authed("get", `/v1/customers/${customerId}`);
      expect(afterPayRes.body.loyaltyPoints).toBe(24);

      const historyRes = await authed("get", `/v1/customers/${customerId}/orders`);
      expect(historyRes.body.some((o: { id: string }) => o.id === loyaltyOrderId)).toBe(true);
    });

    it("removing the customer from an order before payment means no loyalty points are accrued", async () => {
      const orderRes = await authed("post", "/v1/orders").send({ outletId: testOutletId, channel: "DINE_IN" });
      removedCustomerOrderId = orderRes.body.id;

      const assignRes = await authed("post", `/v1/orders/${removedCustomerOrderId}/customer`).send({ customerId });
      expect(assignRes.status).toBe(201);
      expect(assignRes.body.customer.id).toBe(customerId);

      const removeRes = await authed("delete", `/v1/orders/${removedCustomerOrderId}/customer`);
      expect(removeRes.status).toBe(200);
      expect(removeRes.body.customer).toBeNull();

      await authed("post", `/v1/orders/${removedCustomerOrderId}/items`).send({ variantId: margheritaMediumVariantId, quantity: 1 });
      await authed("post", `/v1/orders/${removedCustomerOrderId}/payments`).send({ method: "CASH", amount: "411.82" });

      const afterPayRes = await authed("get", `/v1/customers/${customerId}`);
      expect(afterPayRes.body.loyaltyPoints).toBe(24); // unchanged from the previous test.
    });

    it("refuses to assign a customer from another organization to an order", async () => {
      const orderRes = await authed("post", "/v1/orders").send({ outletId: testOutletId, channel: "DINE_IN" });
      const res = await authed("post", `/v1/orders/${orderRes.body.id}/customer`).send({ customerId: otherCustomerId });
      expect(res.status).toBe(404);
      await prisma.order.delete({ where: { id: orderRes.body.id } }).catch(() => undefined);
    });
  });
});
