import { Test } from "@nestjs/testing";
import { PrismaService } from "@kitchenos/database";
import { AuditService } from "./audit.service.js";

describe("AuditService", () => {
  let service: AuditService;
  let prisma: { auditLog: { create: jest.Mock; findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { auditLog: { create: jest.fn(), findMany: jest.fn() } };
    const module = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AuditService);
  });

  it("log() never throws, even if the write fails", async () => {
    prisma.auditLog.create.mockRejectedValue(new Error("db exploded"));
    await expect(service.log({ action: "test.action", entityType: "Test" })).resolves.toBeUndefined();
  });

  it("list() scopes to the caller's organization and applies filters", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    await service.list("org_1", { entityType: "Order", action: "order.create" });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_1", entityType: "Order", action: "order.create" },
      }),
    );
  });

  it("list() defaults to the most recent 100 entries", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    await service.list("org_1", {});
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });

  it("list() honors a custom limit", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    await service.list("org_1", { limit: 10 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });
});
