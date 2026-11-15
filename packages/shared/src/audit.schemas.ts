import { z } from "zod";

export const auditLogFilterSchema = z.object({
  entityType: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type AuditLogFilterDto = z.infer<typeof auditLogFilterSchema>;
