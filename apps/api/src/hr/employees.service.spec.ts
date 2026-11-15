import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { EmployeesService } from "./employees.service.js";

describe("EmployeesService", () => {
  let service: EmployeesService;
  let prisma: {
    employee: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    outlet: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      employee: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      outlet: { findFirst: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [EmployeesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(EmployeesService);
  });

  it("findOne() 404s instead of leaking an employee from another organization", async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "emp_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("create() 404s when the outlet does not belong to the caller's organization", async () => {
    prisma.outlet.findFirst.mockResolvedValue(null);
    await expect(
      service.create("org_1", { outletId: "outlet_from_org_2", name: "Jane", role: "Cashier", hireDate: new Date() }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.employee.create).not.toHaveBeenCalled();
  });

  it("assertBelongsToOrg() 404s for an employee from another organization", async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    await expect(service.assertBelongsToOrg("org_1", "emp_from_org_2")).rejects.toThrow(NotFoundException);
  });
});
