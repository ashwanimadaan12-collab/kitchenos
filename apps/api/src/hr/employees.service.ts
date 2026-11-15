import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import type { CreateEmployeeDto } from "./dto/create-employee.dto.js";
import type { UpdateEmployeeDto } from "./dto/update-employee.dto.js";

const EMPLOYEE_INCLUDE = { outlet: true };

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, outletId?: string) {
    return this.prisma.employee.findMany({
      where: { organizationId, ...(outletId ? { outletId } : {}) },
      orderBy: { name: "asc" },
      include: EMPLOYEE_INCLUDE,
    });
  }

  async findOne(organizationId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id, organizationId }, include: EMPLOYEE_INCLUDE });
    if (!employee) throw new NotFoundException("Employee not found");
    return employee;
  }

  async create(organizationId: string, dto: CreateEmployeeDto) {
    if (dto.outletId) await this.assertOutletBelongsToOrg(organizationId, dto.outletId);

    return this.prisma.employee.create({
      data: {
        organizationId,
        outletId: dto.outletId,
        name: dto.name,
        role: dto.role,
        phone: dto.phone,
        email: dto.email,
        hireDate: dto.hireDate,
      },
      include: EMPLOYEE_INCLUDE,
    });
  }

  async update(organizationId: string, id: string, dto: UpdateEmployeeDto) {
    await this.findOne(organizationId, id);
    if (dto.outletId) await this.assertOutletBelongsToOrg(organizationId, dto.outletId);

    return this.prisma.employee.update({ where: { id }, data: dto, include: EMPLOYEE_INCLUDE });
  }

  /** Scoped via the employee's own organizationId, so an attendance record never leaks cross-tenant. */
  async assertBelongsToOrg(organizationId: string, employeeId: string) {
    return assertBelongsToOrg(
      () => this.prisma.employee.findFirst({ where: { id: employeeId, organizationId } }),
      "Employee",
    );
  }

  private async assertOutletBelongsToOrg(organizationId: string, outletId: string) {
    await assertBelongsToOrg(
      () => this.prisma.outlet.findFirst({ where: { id: outletId, organizationId } }),
      "Outlet",
    );
  }
}
