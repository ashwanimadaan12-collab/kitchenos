import { Module } from "@nestjs/common";
import { EmployeesController } from "./employees.controller.js";
import { EmployeesService } from "./employees.service.js";
import { AttendanceService } from "./attendance.service.js";

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, AttendanceService],
  exports: [EmployeesService, AttendanceService],
})
export class HrModule {}
