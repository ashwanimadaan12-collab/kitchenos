import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { ExpensesService } from "./expenses.service.js";

describe("ExpensesService", () => {
  let service: ExpensesService;
  let prisma: {
    expense: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    outlet: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      expense: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      outlet: { findFirst: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [ExpensesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ExpensesService);
  });

  it("findOne() 404s instead of leaking an expense from another organization", async () => {
    prisma.expense.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "exp_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("create() 404s when the outlet does not belong to the caller's organization", async () => {
    prisma.outlet.findFirst.mockResolvedValue(null);
    await expect(
      service.create("org_1", "user_1", {
        outletId: "outlet_from_org_2",
        category: "RENT",
        amount: "5000.00",
        incurredAt: new Date("2026-01-01"),
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });

  it("create() records the expense under the caller's org and the authenticated user", async () => {
    prisma.expense.create.mockResolvedValue({ id: "exp_1" });
    await service.create("org_1", "user_1", { category: "OTHER", amount: "100.00", incurredAt: new Date("2026-01-01") });
    expect(prisma.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: "org_1", recordedByUserId: "user_1", category: "OTHER" }),
      }),
    );
  });

  it("update() 404s when the expense does not belong to the caller's organization", async () => {
    prisma.expense.findFirst.mockResolvedValue(null);
    await expect(service.update("org_1", "exp_from_org_2", { amount: "1.00" })).rejects.toThrow(NotFoundException);
    expect(prisma.expense.update).not.toHaveBeenCalled();
  });
});
