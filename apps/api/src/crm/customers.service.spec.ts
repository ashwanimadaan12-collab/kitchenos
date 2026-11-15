import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { LoyaltyService } from "../loyalty/loyalty.service.js";
import { CustomersService } from "./customers.service.js";

describe("CustomersService", () => {
  let service: CustomersService;
  let loyalty: { grantWelcomeBonus: jest.Mock };
  let prisma: {
    customer: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    order: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      customer: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      order: { findMany: jest.fn() },
    };
    loyalty = { grantWelcomeBonus: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: prisma },
        { provide: LoyaltyService, useValue: loyalty },
      ],
    }).compile();
    service = module.get(CustomersService);
  });

  it("findOne() 404s instead of leaking a customer from another organization", async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "cust_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("create() maps a duplicate-phone database error to a 409 Conflict", async () => {
    prisma.customer.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );
    await expect(service.create("org_1", { name: "Asha", phone: "+91-9000000000" })).rejects.toThrow(ConflictException);
    expect(loyalty.grantWelcomeBonus).not.toHaveBeenCalled();
  });

  it("create() 404s when referredByCustomerId belongs to another organization", async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(
      service.create("org_1", { name: "Asha", phone: "+91-9000000000", referredByCustomerId: "cust_from_org_2" }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it("create() grants the welcome bonus and returns the post-bonus balance, not the pre-bonus snapshot", async () => {
    prisma.customer.create.mockResolvedValue({ id: "cust_1", name: "Asha", loyaltyPoints: 0 });
    // grantWelcomeBonus itself updates the row out from under this snapshot — the service must
    // re-fetch rather than return the stale `loyaltyPoints: 0` it got back from create().
    prisma.customer.findFirst.mockResolvedValue({ id: "cust_1", name: "Asha", loyaltyPoints: 20 });

    const customer = await service.create("org_1", { name: "Asha", phone: "+91-9000000000" });

    expect(loyalty.grantWelcomeBonus).toHaveBeenCalledWith("org_1", "cust_1");
    expect(customer.loyaltyPoints).toBe(20);
  });
});
