import { z } from "zod";

/** QUEUED and CANCELLED are set by the system (item added / item voided), never by this endpoint. */
export const advanceTicketStatusSchema = z.object({
  status: z.enum(["IN_PROGRESS", "READY", "SERVED"]),
});
export type AdvanceTicketStatusDto = z.infer<typeof advanceTicketStatusSchema>;
