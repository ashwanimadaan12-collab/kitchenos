import { z } from "zod";

export const createEmployeeSchema = z.object({
  outletId: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  role: z.string().min(1).max(80),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(120).optional(),
  hireDate: z.coerce.date(),
});
export type CreateEmployeeDto = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateEmployeeDto = z.infer<typeof updateEmployeeSchema>;
