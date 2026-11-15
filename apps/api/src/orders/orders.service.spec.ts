import { Test } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { KdsService } from "../kds/kds.service.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { PromotionsService } from "../promotions/promotions.service.js";
import { CommunicationsService } from "../communications/communications.service.js";
import { LoyaltyService } from "../loyalty/loyalty.service.js";
import { CampaignsService } from "../campaigns/campaigns.service.js";
import { PricingRulesService } from "../pricing/pricing-rules.service.js";
import { OrdersService } from "./orders.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("OrdersService", () => {
  let service: OrdersService;
  let promotions: {
    validateAndComputeDiscount: jest.Mock;
    recordRedemption: jest.Mock;
    clearRedemption: jest.Mock;
  };
  let loyalty: {
    earnPoints: jest.Mock;
    grantReferralBonusIfEligible: jest.Mock;
    redeemPoints: jest.Mock;
    reverseRedemption: jest.Mock;
  };
  let communications: { sendOrderConfirmation: jest.Mock; sendOrderStatusNotification: jest.Mock };
  let campaigns: { recordConversionIfAny: jest.Mock };
  let pricingRules: { quote: jest.Mock };
  let prisma: {
    outlet: { findFirst: jest.Mock };
    order: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    productVariant: { findFirst: jest.Mock };
    menuItem: { findFirst: jest.Mock };
    outletProductPrice: { findFirst: jest.Mock };
    orderItem: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    payment: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    combo: { findFirst: jest.Mock };
    menuComboItem: { findFirst: jest.Mock };
    customer: { findFirst: jest.Mock };
    loyaltyRedemption: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      outlet: { findFirst: jest.fn() },
      order: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(),
      },
      productVariant: { findFirst: jest.fn() },
      menuItem: { findFirst: jest.fn() },
      outletProductPrice: { findFirst: jest.fn() },
      orderItem: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
      payment: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      combo: { findFirst: jest.fn() },
      menuComboItem: { findFirst: jest.fn() },
      customer: { findFirst: jest.fn() },
      loyaltyRedemption: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.order.findUniqueOrThrow.mockResolvedValue({ id: "order_1", discountAmount: D("0"), loyaltyDiscountAmount: D("0") });
    const kds = {
      createTicketForOrderItem: jest.fn().mockResolvedValue(null),
      cancelTicketForOrderItem: jest.fn().mockResolvedValue(undefined),
    };
    const inventory = {
      consumeForOrderItem: jest.fn().mockResolvedValue(undefined),
      reverseForOrderItem: jest.fn().mockResolvedValue(undefined),
    };
    promotions = {
      validateAndComputeDiscount: jest.fn(),
      recordRedemption: jest.fn(),
      clearRedemption: jest.fn(),
    };
    loyalty = {
      earnPoints: jest.fn().mockResolvedValue(undefined),
      grantReferralBonusIfEligible: jest.fn().mockResolvedValue(undefined),
      redeemPoints: jest.fn(),
      reverseRedemption: jest.fn().mockResolvedValue(undefined),
    };
    communications = {
      sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
      sendOrderStatusNotification: jest.fn().mockResolvedValue(undefined),
    };
    campaigns = { recordConversionIfAny: jest.fn().mockResolvedValue(undefined) };
    pricingRules = {
      quote: jest.fn().mockResolvedValue({ finalPrice: D("100"), selectedRule: null }),
    };
    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: KdsService, useValue: kds },
        { provide: InventoryService, useValue: inventory },
        { provide: PromotionsService, useValue: promotions },
        { provide: CommunicationsService, useValue: communications },
        { provide: LoyaltyService, useValue: loyalty },
        { provide: CampaignsService, useValue: campaigns },
        { provide: PricingRulesService, useValue: pricingRules },
      ],
    }).compile();
    service = module.get(OrdersService);
  });

  it("create() 404s for an outlet from another organization", async () => {
    prisma.outlet.findFirst.mockResolvedValue(null);
    await expect(service.create("org_1", "user_1", { outletId: "outlet_from_org_2", channel: "DINE_IN" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("create() assigns the next outlet order number inside one transaction", async () => {
    prisma.outlet.findFirst.mockResolvedValue({ id: "outlet_1", organizationId: "org_1" });
    const tx = {
      outletOrderSequence: { upsert: jest.fn().mockResolvedValue({ outletId: "outlet_1", lastNumber: 7 }) },
      order: { create: jest.fn().mockResolvedValue({ id: "order_1", orderNumber: 7 }) },
    };
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await service.create("org_1", "user_1", { outletId: "outlet_1", channel: "DINE_IN" });

    expect(result).toEqual({ id: "order_1", orderNumber: 7 });
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orderNumber: 7, outletId: "outlet_1" }) }),
    );
  });

  it("addItem() refuses to add to an order that is not OPEN", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "order_1", organizationId: "org_1", status: "PAID" });
    await expect(service.addItem("org_1", "order_1", { variantId: "v1", quantity: 1 })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.orderItem.create).not.toHaveBeenCalled();
  });

  it("addItem() refuses an item that is not on an active menu at the order's outlet", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "order_1", organizationId: "org_1", status: "OPEN", outletId: "outlet_1" });
    prisma.productVariant.findFirst.mockResolvedValue({
      id: "v1",
      basePrice: D("100"),
      product: { name: "Thing", taxCategory: null },
    });
    prisma.menuItem.findFirst.mockResolvedValue(null);

    await expect(service.addItem("org_1", "order_1", { variantId: "v1", quantity: 1 })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.orderItem.create).not.toHaveBeenCalled();
  });

  it("addItem() prices from the pricing engine's quote, not the variant's raw base price", async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: "order_1",
      organizationId: "org_1",
      status: "OPEN",
      outletId: "outlet_1",
      channel: "DINE_IN",
    });
    prisma.productVariant.findFirst.mockResolvedValue({
      id: "v1",
      name: "Regular",
      basePrice: D("100"),
      product: { name: "Thing", taxCategory: { ratePercent: D("10") } },
    });
    prisma.menuItem.findFirst.mockResolvedValue({ id: "mi1" });
    pricingRules.quote.mockResolvedValue({
      finalPrice: D("120"),
      selectedRule: { id: "rule_1", label: "Weekend surge" },
    });
    prisma.orderItem.create.mockResolvedValue({ id: "item_1" });
    prisma.orderItem.findMany.mockResolvedValue([
      { lineSubtotal: D("240"), taxAmount: D("24") }, // quantity 2 * 120
    ]);
    prisma.order.update.mockResolvedValue({});
    prisma.order.findFirst.mockResolvedValueOnce({
      id: "order_1",
      organizationId: "org_1",
      status: "OPEN",
      outletId: "outlet_1",
      channel: "DINE_IN",
    });
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [] });

    await service.addItem("org_1", "order_1", { variantId: "v1", quantity: 2 });

    expect(pricingRules.quote).toHaveBeenCalledWith("org_1", { variantId: "v1", outletId: "outlet_1", channel: "DINE_IN" });
    expect(prisma.orderItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitPrice: D("120"),
          lineSubtotal: D("240"),
          taxAmount: D("24"),
          lineTotal: D("264"),
          pricingRuleId: "rule_1",
          pricingRuleLabel: "Weekend surge",
        }),
      }),
    );
  });

  it("addPayment() rejects payment on an order with no active items", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "order_1", organizationId: "org_1", status: "OPEN", total: D("0") });
    prisma.orderItem.count.mockResolvedValueOnce(0);
    await expect(
      service.addPayment("org_1", "order_1", { method: "CASH", amount: "10.00" }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("addPayment() allows a ₹0.00 payment to close out a fully-discounted order", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", organizationId: "org_1", status: "OPEN", total: D("0") });
    prisma.orderItem.count.mockResolvedValueOnce(1);
    prisma.payment.create.mockResolvedValue({ id: "pay_1" });
    prisma.payment.findMany.mockResolvedValue([{ amount: D("0") }]);
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [{ amount: D("0") }] });

    await service.addPayment("org_1", "order_1", { method: "CASH", amount: "0.00" });

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "order_1", status: "OPEN" },
      data: expect.objectContaining({ status: "PAID" }),
    });
    expect(communications.sendOrderConfirmation).toHaveBeenCalledWith("org_1", expect.objectContaining({ id: "order_1" }));
  });

  it("addPayment() marks the order PAID once payments cover the total", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", organizationId: "org_1", status: "OPEN", total: D("100") });
    prisma.payment.create.mockResolvedValue({ id: "pay_1" });
    prisma.payment.findMany.mockResolvedValue([{ amount: D("100") }]);
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [{ amount: D("100") }] });

    await service.addPayment("org_1", "order_1", { method: "CASH", amount: "100.00" });

    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "order_1", status: "OPEN" }, data: expect.objectContaining({ status: "PAID" }) }),
    );
    expect(communications.sendOrderConfirmation).toHaveBeenCalledWith("org_1", expect.objectContaining({ id: "order_1" }));
  });

  it("addPayment() does not double-credit loyalty points when it loses the OPEN→PAID race", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({
      id: "order_1",
      organizationId: "org_1",
      status: "OPEN",
      total: D("100"),
      customerId: "cust_1",
      outlet: { id: "outlet_1", brandId: "brand_1" },
    });
    prisma.payment.create.mockResolvedValue({ id: "pay_1" });
    prisma.payment.findMany.mockResolvedValue([{ amount: D("100") }]);
    // Another concurrent request already flipped the order to PAID first.
    prisma.order.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [{ amount: D("100") }] });

    await service.addPayment("org_1", "order_1", { method: "CASH", amount: "100.00" });

    expect(loyalty.earnPoints).not.toHaveBeenCalled();
    expect(loyalty.grantReferralBonusIfEligible).not.toHaveBeenCalled();
    expect(campaigns.recordConversionIfAny).not.toHaveBeenCalled();
    expect(communications.sendOrderConfirmation).not.toHaveBeenCalled();
  });

  it("addPayment() accrues loyalty points once the order with a linked customer is fully paid", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({
      id: "order_1",
      organizationId: "org_1",
      status: "OPEN",
      total: D("349.99"),
      customerId: "cust_1",
      outlet: { id: "outlet_1", brandId: "brand_1" },
    });
    prisma.payment.create.mockResolvedValue({ id: "pay_1" });
    prisma.payment.findMany.mockResolvedValue([{ amount: D("349.99") }]);
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [] });

    await service.addPayment("org_1", "order_1", { method: "CASH", amount: "349.99" });

    expect(loyalty.earnPoints).toHaveBeenCalledWith("org_1", "cust_1", D("349.99"), "order_1", "brand_1");
    expect(loyalty.grantReferralBonusIfEligible).toHaveBeenCalledWith("org_1", "cust_1", "order_1");
    expect(campaigns.recordConversionIfAny).toHaveBeenCalledWith("org_1", "cust_1", "order_1", D("349.99"));
    expect(communications.sendOrderConfirmation).toHaveBeenCalledWith("org_1", expect.objectContaining({ id: "order_1" }));
  });

  it("addPayment() does not touch loyalty points when no customer is linked", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({
      id: "order_1",
      organizationId: "org_1",
      status: "OPEN",
      total: D("100"),
      customerId: null,
      outlet: { id: "outlet_1", brandId: "brand_1" },
    });
    prisma.payment.create.mockResolvedValue({ id: "pay_1" });
    prisma.payment.findMany.mockResolvedValue([{ amount: D("100") }]);
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [] });

    await service.addPayment("org_1", "order_1", { method: "CASH", amount: "100.00" });

    expect(loyalty.earnPoints).not.toHaveBeenCalled();
    expect(communications.sendOrderConfirmation).toHaveBeenCalledWith("org_1", expect.objectContaining({ id: "order_1" }));
  });

  it("assignCustomer() 404s when the customer does not belong to the caller's organization", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", organizationId: "org_1", status: "OPEN" });
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(service.assignCustomer("org_1", "order_1", { customerId: "cust_from_org_2" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it("assignCustomer() links the customer to the order", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", organizationId: "org_1", status: "OPEN" });
    prisma.customer.findFirst.mockResolvedValue({ id: "cust_1" });
    prisma.order.update.mockResolvedValue({});
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [] });

    await service.assignCustomer("org_1", "order_1", { customerId: "cust_1" });

    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: "order_1" }, data: { customerId: "cust_1" } });
  });

  it("removeCustomer() clears the customer link", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", organizationId: "org_1", status: "OPEN" });
    prisma.order.update.mockResolvedValue({});
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [] });

    await service.removeCustomer("org_1", "order_1");

    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: "order_1" }, data: { customerId: null } });
  });

  it("voidOrder() refuses to void an order that already has payments", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "order_1", organizationId: "org_1", status: "OPEN" });
    prisma.payment.count.mockResolvedValue(1);

    await expect(service.voidOrder("org_1", "order_1")).rejects.toThrow(ConflictException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it("voidOrder() voids an order with no payments", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", organizationId: "org_1", status: "OPEN" });
    prisma.payment.count.mockResolvedValue(0);
    prisma.orderItem.findMany.mockResolvedValueOnce([]);
    prisma.order.update.mockResolvedValue({});
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", status: "VOIDED" });

    const result = await service.voidOrder("org_1", "order_1");

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "order_1" }, data: expect.objectContaining({ status: "VOIDED" }) }),
    );
    expect(result).toEqual({ id: "order_1", status: "VOIDED" });
    expect(communications.sendOrderStatusNotification).toHaveBeenCalledWith("org_1", expect.objectContaining({ id: "order_1" }));
    expect(loyalty.reverseRedemption).toHaveBeenCalledWith("org_1", "order_1");
  });

  it("voidOrder() reverses inventory and cancels KDS tickets for every active line", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", organizationId: "org_1", status: "OPEN" });
    prisma.payment.count.mockResolvedValue(0);
    prisma.orderItem.findMany.mockResolvedValueOnce([{ id: "item_1" }, { id: "item_2" }]);
    prisma.orderItem.update.mockResolvedValue({});
    prisma.order.update.mockResolvedValue({});
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", status: "VOIDED" });

    await service.voidOrder("org_1", "order_1");

    expect(prisma.orderItem.update).toHaveBeenCalledWith({ where: { id: "item_1" }, data: { status: "VOIDED" } });
    expect(prisma.orderItem.update).toHaveBeenCalledWith({ where: { id: "item_2" }, data: { status: "VOIDED" } });
  });

  it("addComboItem() 404s when the combo is not on an active menu at the order's outlet", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "order_1", organizationId: "org_1", status: "OPEN", outletId: "outlet_1" });
    prisma.combo.findFirst.mockResolvedValue({ id: "combo_1", name: "Combo", comboPrice: D("100"), items: [] });
    prisma.menuComboItem.findFirst.mockResolvedValue(null);

    await expect(service.addComboItem("org_1", "order_1", { comboId: "combo_1", quantity: 1 })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.orderItem.create).not.toHaveBeenCalled();
  });

  it("addComboItem() allocates the bundle price across components, with the last line taking the rounding remainder", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", organizationId: "org_1", status: "OPEN", outletId: "outlet_1" });
    prisma.combo.findFirst.mockResolvedValue({
      id: "combo_1",
      name: "Pizza + Coke Combo",
      comboPrice: D("100"),
      items: [
        { quantity: 1, variant: { id: "v1", name: "Pizza", basePrice: D("70"), product: { taxCategory: null } } },
        { quantity: 1, variant: { id: "v2", name: "Coke", basePrice: D("30"), product: { taxCategory: null } } },
      ],
    });
    prisma.menuComboItem.findFirst.mockResolvedValue({ id: "mci_1" });
    prisma.orderItem.create.mockResolvedValueOnce({ id: "item_1" }).mockResolvedValueOnce({ id: "item_2" });
    prisma.orderItem.findMany.mockResolvedValue([]);
    prisma.order.update.mockResolvedValue({});
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [] });

    await service.addComboItem("org_1", "order_1", { comboId: "combo_1", quantity: 1 });

    // 70/100 of the 100 bundle price -> 70 for the pizza line.
    expect(prisma.orderItem.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ lineSubtotal: D("70") }) }),
    );
    // Remainder (not a separately rounded ratio) -> exactly 30 for the coke line.
    expect(prisma.orderItem.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ lineSubtotal: D("30") }) }),
    );
  });

  it("removeComboItem() 404s when no active lines share that combo instance id", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "order_1", organizationId: "org_1", status: "OPEN", outletId: "outlet_1" });
    prisma.orderItem.findMany.mockResolvedValue([]);
    await expect(service.removeComboItem("org_1", "order_1", "combo_instance_1")).rejects.toThrow(NotFoundException);
  });

  it("removeComboItem() voids every component line of the combo instance together", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", organizationId: "org_1", status: "OPEN", outletId: "outlet_1" });
    prisma.orderItem.findMany
      .mockResolvedValueOnce([{ id: "item_1" }, { id: "item_2" }]) // the combo-instance lookup
      .mockResolvedValueOnce([]); // recalculateTotals' active-items query
    prisma.orderItem.update.mockResolvedValue({});
    prisma.order.update.mockResolvedValue({});
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [] });

    await service.removeComboItem("org_1", "order_1", "combo_instance_1");

    expect(prisma.orderItem.update).toHaveBeenCalledTimes(2);
    expect(prisma.orderItem.update).toHaveBeenNthCalledWith(1, { where: { id: "item_1" }, data: { status: "VOIDED" } });
    expect(prisma.orderItem.update).toHaveBeenNthCalledWith(2, { where: { id: "item_2" }, data: { status: "VOIDED" } });
  });

  it("updateItemQuantity() refuses to edit a line that belongs to a combo instance", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "order_1", organizationId: "org_1", status: "OPEN" });
    prisma.orderItem.findFirst.mockResolvedValue({ id: "item_1", comboInstanceId: "combo_instance_1", quantity: 1 });

    await expect(service.updateItemQuantity("org_1", "order_1", "item_1", { quantity: 2 })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });

  it("removeItem() refuses to void a single combo-component line; directs to removeComboItem instead", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "order_1", organizationId: "org_1", status: "OPEN" });
    prisma.orderItem.findFirst.mockResolvedValue({ id: "item_1", comboInstanceId: "combo_instance_1" });

    await expect(service.removeItem("org_1", "order_1", "item_1")).rejects.toThrow(ConflictException);
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });

  it("applyPromotion() refuses when the order already has a promotion applied", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "order_1", organizationId: "org_1", status: "OPEN", promotionId: "promo_1" });
    await expect(service.applyPromotion("org_1", "order_1", { code: "TENOFF" })).rejects.toThrow(ConflictException);
    expect(promotions.validateAndComputeDiscount).not.toHaveBeenCalled();
  });

  it("applyPromotion() records the redemption and writes the discount onto the order", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", organizationId: "org_1", status: "OPEN", promotionId: null });
    promotions.validateAndComputeDiscount.mockResolvedValue({ promotion: { id: "promo_1" }, discountAmount: D("30") });
    prisma.orderItem.findMany.mockResolvedValue([]);
    prisma.order.update.mockResolvedValue({});
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [] });

    await service.applyPromotion("org_1", "order_1", { code: "TENOFF" });

    expect(promotions.recordRedemption).toHaveBeenCalledWith("org_1", "order_1", "promo_1", D("30"));
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "order_1" }, data: { promotionId: "promo_1", discountAmount: D("30") } }),
    );
  });

  it("removePromotion() 404s when no promotion is applied", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "order_1", organizationId: "org_1", status: "OPEN", promotionId: null });
    await expect(service.removePromotion("org_1", "order_1")).rejects.toThrow(NotFoundException);
  });

  it("removePromotion() un-counts the redemption and clears the discount", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", organizationId: "org_1", status: "OPEN", promotionId: "promo_1" });
    prisma.orderItem.findMany.mockResolvedValue([]);
    prisma.order.update.mockResolvedValue({});
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [] });

    await service.removePromotion("org_1", "order_1");

    expect(promotions.clearRedemption).toHaveBeenCalledWith("org_1", "order_1");
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "order_1" }, data: { promotionId: null, discountAmount: D("0") } }),
    );
  });

  it("redeemLoyaltyPoints() refuses an order with no linked customer", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "order_1", organizationId: "org_1", status: "OPEN", customerId: null });
    await expect(service.redeemLoyaltyPoints("org_1", "order_1", { points: 10 })).rejects.toThrow(BadRequestException);
    expect(loyalty.redeemPoints).not.toHaveBeenCalled();
  });

  it("redeemLoyaltyPoints() refuses a second redemption on the same order", async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: "order_1",
      organizationId: "org_1",
      status: "OPEN",
      customerId: "cust_1",
      outlet: { id: "outlet_1", brandId: "brand_1" },
    });
    prisma.loyaltyRedemption.findUnique.mockResolvedValue({ id: "redemption_1" });
    await expect(service.redeemLoyaltyPoints("org_1", "order_1", { points: 10 })).rejects.toThrow(ConflictException);
    expect(loyalty.redeemPoints).not.toHaveBeenCalled();
  });

  it("redeemLoyaltyPoints() applies the discount and writes it onto the order", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({
      id: "order_1",
      organizationId: "org_1",
      status: "OPEN",
      customerId: "cust_1",
      outlet: { id: "outlet_1", brandId: "brand_1" },
    });
    prisma.loyaltyRedemption.findUnique.mockResolvedValueOnce(null);
    loyalty.redeemPoints.mockResolvedValue({ pointsRedeemed: 50, discountAmount: D("50") });
    prisma.orderItem.findMany.mockResolvedValue([]);
    prisma.order.update.mockResolvedValue({});
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [] });

    await service.redeemLoyaltyPoints("org_1", "order_1", { points: 50 });

    expect(loyalty.redeemPoints).toHaveBeenCalledWith("org_1", "order_1", "cust_1", 50, "brand_1");
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order_1" },
        data: { loyaltyPointsRedeemed: 50, loyaltyDiscountAmount: D("50") },
      }),
    );
  });

  it("removeLoyaltyRedemption() 404s when no redemption exists on this order", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "order_1", organizationId: "org_1", status: "OPEN" });
    prisma.loyaltyRedemption.findUnique.mockResolvedValue(null);
    await expect(service.removeLoyaltyRedemption("org_1", "order_1")).rejects.toThrow(NotFoundException);
  });

  it("removeLoyaltyRedemption() reverses the redemption and zeroes the order's loyalty fields", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", organizationId: "org_1", status: "OPEN" });
    prisma.loyaltyRedemption.findUnique.mockResolvedValueOnce({ id: "redemption_1" }).mockResolvedValueOnce(null);
    prisma.orderItem.findMany.mockResolvedValue([]);
    prisma.order.update.mockResolvedValue({});
    prisma.order.findFirst.mockResolvedValueOnce({ id: "order_1", items: [], payments: [] });

    await service.removeLoyaltyRedemption("org_1", "order_1");

    expect(loyalty.reverseRedemption).toHaveBeenCalledWith("org_1", "order_1");
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "order_1" }, data: { loyaltyPointsRedeemed: 0, loyaltyDiscountAmount: D("0") } }),
    );
  });

  it("removeLoyaltyRedemption() surfaces a conflict if the reversal silently failed to clear the redemption", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "order_1", organizationId: "org_1", status: "OPEN" });
    prisma.loyaltyRedemption.findUnique.mockResolvedValueOnce({ id: "redemption_1" }).mockResolvedValueOnce({ id: "redemption_1" });

    await expect(service.removeLoyaltyRedemption("org_1", "order_1")).rejects.toThrow(ConflictException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  /**
   * syncOfflineOrder orchestrates create/addItem/addPayment, each of which does its own
   * findFirst/findOne round trips — threading those through individual mockResolvedValueOnce
   * calls would be unreadable and fragile. A small in-memory fake store is more honest here: it
   * exercises the real service code path (nothing about syncOfflineOrder itself is mocked away)
   * while keeping the test readable. The full real-database flow is covered by the e2e spec.
   */
  describe("syncOfflineOrder", () => {
    interface FakeOrder {
      id: string;
      organizationId: string;
      clientOrderId?: string;
      status: "OPEN" | "PAID";
      outletId: string;
      channel: string;
      orderNumber: number;
      total: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      loyaltyDiscountAmount: Prisma.Decimal;
      customerId: string | null;
    }
    let orders: FakeOrder[];
    let orderItems: { id: string; orderId: string; variantId: string; status: string; lineSubtotal: Prisma.Decimal; taxAmount: Prisma.Decimal }[];
    let orderPayments: { id: string; orderId: string; amount: Prisma.Decimal }[];
    let nextId: number;

    function withOutlet(order: FakeOrder) {
      return { ...order, outlet: { brandId: "brand_1" }, items: orderItems.filter((i) => i.orderId === order.id), payments: orderPayments.filter((p) => p.orderId === order.id) };
    }

    beforeEach(() => {
      orders = [];
      orderItems = [];
      orderPayments = [];
      nextId = 1;

      prisma.outlet.findFirst.mockResolvedValue({ id: "outlet_1", organizationId: "org_1" });
      prisma.productVariant.findFirst.mockResolvedValue({
        id: "v1",
        name: "Regular",
        basePrice: D("100"),
        product: { name: "Thing", taxCategory: { ratePercent: D("0") } },
      });
      prisma.menuItem.findFirst.mockResolvedValue({ id: "mi1" });
      pricingRules.quote.mockResolvedValue({ finalPrice: D("100"), selectedRule: null });

      prisma.order.findFirst.mockImplementation(async ({ where }: { where: { id?: string; clientOrderId?: string; organizationId: string } }) => {
        if ("clientOrderId" in where) {
          const match = orders.find((o) => o.organizationId === where.organizationId && o.clientOrderId === where.clientOrderId);
          return match ? withOutlet(match) : null;
        }
        const match = orders.find((o) => o.id === where.id && o.organizationId === where.organizationId);
        return match ? withOutlet(match) : null;
      });
      prisma.order.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { id: string } }) => {
        const order = orders.find((o) => o.id === where.id);
        if (!order) throw new Error("not found");
        return order;
      });
      prisma.order.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<FakeOrder> }) => {
        Object.assign(orders.find((o) => o.id === where.id)!, data);
        return orders.find((o) => o.id === where.id);
      });
      prisma.order.updateMany.mockImplementation(
        async ({ where, data }: { where: { id: string; status: string }; data: Partial<FakeOrder> }) => {
          const order = orders.find((o) => o.id === where.id && o.status === where.status);
          if (!order) return { count: 0 };
          Object.assign(order, data);
          return { count: 1 };
        },
      );
      prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
        cb({
          outletOrderSequence: { upsert: jest.fn().mockResolvedValue({ lastNumber: orders.length + 1 }) },
          order: {
            create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
              const order: FakeOrder = {
                id: `order_${nextId++}`,
                organizationId: data.organizationId as string,
                clientOrderId: data.clientOrderId as string | undefined,
                status: "OPEN",
                outletId: data.outletId as string,
                channel: data.channel as string,
                orderNumber: data.orderNumber as number,
                total: D("0"),
                discountAmount: D("0"),
                loyaltyDiscountAmount: D("0"),
                customerId: (data.customerId as string | undefined) ?? null,
              };
              orders.push(order);
              return withOutlet(order);
            }),
          },
        }),
      );
      prisma.orderItem.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const item = {
          id: `item_${nextId++}`,
          orderId: data.orderId as string,
          variantId: data.variantId as string,
          status: "ACTIVE",
          lineSubtotal: data.lineSubtotal as Prisma.Decimal,
          taxAmount: data.taxAmount as Prisma.Decimal,
        };
        orderItems.push(item);
        return item;
      });
      prisma.orderItem.findMany.mockImplementation(async ({ where }: { where: { orderId: string; status?: string } }) =>
        orderItems.filter((i) => i.orderId === where.orderId && (!where.status || i.status === where.status)),
      );
      prisma.payment.create.mockImplementation(async ({ data }: { data: { orderId: string; amount: Prisma.Decimal } }) => {
        const payment = { id: `pay_${nextId++}`, orderId: data.orderId, amount: data.amount };
        orderPayments.push(payment);
        return payment;
      });
      prisma.payment.findMany.mockImplementation(async ({ where }: { where: { orderId: string } }) =>
        orderPayments.filter((p) => p.orderId === where.orderId),
      );
      prisma.payment.count.mockImplementation(
        async ({ where }: { where: { orderId: string } }) => orderPayments.filter((p) => p.orderId === where.orderId).length,
      );
    });

    it("creates the order, adds every item, and takes a cash payment for a brand-new clientOrderId", async () => {
      const result = await service.syncOfflineOrder("org_1", "user_1", {
        clientOrderId: "11111111-1111-1111-1111-111111111111",
        outletId: "outlet_1",
        channel: "DINE_IN",
        items: [{ variantId: "v1", quantity: 2 }],
        cashTendered: "200",
      });

      expect(orders).toHaveLength(1);
      expect(orders[0]!.clientOrderId).toBe("11111111-1111-1111-1111-111111111111");
      expect(orders[0]!.status).toBe("PAID");
      expect(orderItems).toHaveLength(1);
      expect(orderPayments).toHaveLength(1);
      expect(result.status).toBe("PAID");
    });

    it("is idempotent: retrying the same clientOrderId never creates a second order", async () => {
      const dto = {
        clientOrderId: "22222222-2222-2222-2222-222222222222",
        outletId: "outlet_1",
        channel: "DINE_IN" as const,
        items: [{ variantId: "v1", quantity: 1 }],
        cashTendered: "100",
      };

      await service.syncOfflineOrder("org_1", "user_1", dto);
      await service.syncOfflineOrder("org_1", "user_1", dto);

      expect(orders).toHaveLength(1);
      expect(orderItems).toHaveLength(1); // not duplicated on retry
      expect(orderPayments).toHaveLength(1); // not duplicated on retry
    });

    it("resumes a partially-synced order instead of re-adding an item that already landed", async () => {
      const clientOrderId = "33333333-3333-3333-3333-333333333333";
      // Simulate a prior attempt that created the order and added one item, then lost connectivity
      // before the payment went through.
      const order: FakeOrder = {
        id: "order_partial",
        organizationId: "org_1",
        clientOrderId,
        status: "OPEN",
        outletId: "outlet_1",
        channel: "DINE_IN",
        orderNumber: 1,
        total: D("100"),
        discountAmount: D("0"),
        loyaltyDiscountAmount: D("0"),
        customerId: null,
      };
      orders.push(order);
      orderItems.push({ id: "item_existing", orderId: order.id, variantId: "v1", status: "ACTIVE", lineSubtotal: D("100"), taxAmount: D("0") });

      await service.syncOfflineOrder("org_1", "user_1", {
        clientOrderId,
        outletId: "outlet_1",
        channel: "DINE_IN",
        items: [{ variantId: "v1", quantity: 1 }],
        cashTendered: "100",
      });

      expect(orderItems).toHaveLength(1); // v1 was already added — never re-added.
      expect(orderPayments).toHaveLength(1); // the payment that never landed on the prior attempt does now.
      expect(order.status).toBe("PAID");
    });
  });
});
