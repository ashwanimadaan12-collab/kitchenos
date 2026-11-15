import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { AttendanceService } from "./attendance.service.js";
import { EmployeesService } from "./employees.service.js";

describe("AttendanceService", () => {
  let service: AttendanceService;
  let prisma: {
    attendance: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let employees: { assertBelongsToOrg: jest.Mock };

  beforeEach(async () => {
    prisma = {
      attendance: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    employees = { assertBelongsToOrg: jest.fn().mockResolvedValue({ id: "emp_1" }) };
    const module = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmployeesService, useValue: employees },
      ],
    }).compile();
    service = module.get(AttendanceService);
  });

  it("clockIn() 404s for an employee from another organization", async () => {
    employees.assertBelongsToOrg.mockRejectedValue(new NotFoundException("Employee not found"));
    await expect(service.clockIn("org_1", "emp_from_org_2")).rejects.toThrow(NotFoundException);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });

  it("clockIn() refuses to clock in an employee who is already clocked in", async () => {
    prisma.attendance.findFirst.mockResolvedValue({ id: "att_1", clockOut: null });
    await expect(service.clockIn("org_1", "emp_1")).rejects.toThrow(ConflictException);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });

  it("clockIn() creates an open attendance record when none is open", async () => {
    prisma.attendance.findFirst.mockResolvedValue(null);
    prisma.attendance.create.mockResolvedValue({ id: "att_1" });
    await service.clockIn("org_1", "emp_1");
    expect(prisma.attendance.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ employeeId: "emp_1" }) }),
    );
  });

  it("clockOut() 404s when the employee has no open attendance record", async () => {
    prisma.attendance.findFirst.mockResolvedValue(null);
    await expect(service.clockOut("org_1", "emp_1")).rejects.toThrow(NotFoundException);
    expect(prisma.attendance.update).not.toHaveBeenCalled();
  });

  it("clockOut() closes the open attendance record", async () => {
    prisma.attendance.findFirst.mockResolvedValue({ id: "att_1", clockOut: null });
    prisma.attendance.update.mockResolvedValue({ id: "att_1" });
    await service.clockOut("org_1", "emp_1");
    expect(prisma.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "att_1" }, data: expect.objectContaining({ clockOut: expect.any(Date) }) }),
    );
  });
});
