import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(1).max(40),
  email: z.string().email().max(120).optional(),
  notes: z.string().max(1000).optional(),
  birthday: z.coerce.date().optional(),
  referredByCustomerId: z.string().min(1).optional(),
});
export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;

// referredByCustomerId is one-time, set at signup — not editable afterwards.
export const updateCustomerSchema = createCustomerSchema.omit({ referredByCustomerId: true }).partial();
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;

export const assignCustomerToOrderSchema = z.object({
  customerId: z.string().min(1),
});
export type AssignCustomerToOrderDto = z.infer<typeof assignCustomerToOrderSchema>;
