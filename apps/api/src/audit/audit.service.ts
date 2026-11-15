import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import type { AuditLogFilterDto } from "./dto/audit-log-filter.dto.js";

export interface AuditLogInput {
  action: string;
  entityType: string;
  entityId?: string;
  organizationId?: string;
  userId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Audit log writes never throw into the caller's flow — a logging failure must not fail the business action. */
  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          organizationId: input.organizationId,
          userId: input.userId,
          ipAddress: input.ipAddress,
          metadata: input.metadata as object | undefined,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log for action "${input.action}"`, err);
    }
  }

  /**
   * Scoped to one organization's own entries — a handful of actions (login/logout) are logged
   * without an organizationId, since they happen before any org is selected, and deliberately
   * don't show up here; a platform-wide log is a separate (future) concern, not this org's view.
   */
  async list(organizationId: string, filters: AuditLogFilterDto) {
    return this.prisma.auditLog.findMany({
      where: {
        organizationId,
        ...(filters.entityType ? { entityType: filters.entityType } : {}),
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.from || filters.to
          ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lt: filters.to } : {}) } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? 100,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }
}
