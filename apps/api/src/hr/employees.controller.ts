import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { EmployeesService } from "./employees.service.js";
import { AttendanceService } from "./attendance.service.js";
import { createEmployeeSchema, type CreateEmployeeDto } from "./dto/create-employee.dto.js";
import { updateEmployeeSchema, type UpdateEmployeeDto } from "./dto/update-employee.dto.js";

@Controller({ path: "employees", version: "1" })
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly attendance: AttendanceService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EMPLOYEE_VIEW)
  async list(@CurrentUser() user: RequestUser, @Query("outletId") outletId?: string) {
    return this.employees.list(requireOrganizationId(user), outletId);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.EMPLOYEE_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.employees.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createEmployeeSchema)) dto: CreateEmployeeDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const employee = await this.employees.create(organizationId, dto);
    await this.audit.log({
      action: "employee.create",
      entityType: "Employee",
      entityId: employee.id,
      organizationId,
      userId: user.userId,
      metadata: { name: employee.name, role: employee.role },
    });
    return employee;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema)) dto: UpdateEmployeeDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const employee = await this.employees.update(organizationId, id, dto);
    await this.audit.log({
      action: "employee.update",
      entityType: "Employee",
      entityId: employee.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return employee;
  }

  @Get(":id/attendance")
  @RequirePermissions(PERMISSIONS.ATTENDANCE_VIEW)
  async listAttendance(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.attendance.list(requireOrganizationId(user), id);
  }

  @Post(":id/clock-in")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MANAGE)
  async clockIn(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const organizationId = requireOrganizationId(user);
    const record = await this.attendance.clockIn(organizationId, id);
    await this.audit.log({
      action: "attendance.clock_in",
      entityType: "Employee",
      entityId: id,
      organizationId,
      userId: user.userId,
    });
    return record;
  }

  @Post(":id/clock-out")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MANAGE)
  async clockOut(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const organizationId = requireOrganizationId(user);
    const record = await this.attendance.clockOut(organizationId, id);
    await this.audit.log({
      action: "attendance.clock_out",
      entityType: "Employee",
      entityId: id,
      organizationId,
      userId: user.userId,
    });
    return record;
  }
}
