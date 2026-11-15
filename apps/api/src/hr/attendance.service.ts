import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { EmployeesService } from "./employees.service.js";

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
  ) {}

  async list(organizationId: string, employeeId: string) {
    await this.employees.assertBelongsToOrg(organizationId, employeeId);
    return this.prisma.attendance.findMany({ where: { employeeId }, orderBy: { clockIn: "desc" } });
  }

  /** At most one open (clockOut: null) record per employee — checked here since a partial unique
   *  index on a nullable column can't portably express "unique while null" in Prisma's schema. */
  async clockIn(organizationId: string, employeeId: string) {
    await this.employees.assertBelongsToOrg(organizationId, employeeId);
    const open = await this.prisma.attendance.findFirst({ where: { employeeId, clockOut: null } });
    if (open) throw new ConflictException("This employee is already clocked in");

    return this.prisma.attendance.create({ data: { employeeId, clockIn: new Date() } });
  }

  async clockOut(organizationId: string, employeeId: string) {
    await this.employees.assertBelongsToOrg(organizationId, employeeId);
    const open = await this.prisma.attendance.findFirst({ where: { employeeId, clockOut: null } });
    if (!open) throw new NotFoundException("This employee is not currently clocked in");

    return this.prisma.attendance.update({ where: { id: open.id }, data: { clockOut: new Date() } });
  }
}
