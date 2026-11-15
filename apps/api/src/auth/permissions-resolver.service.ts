import { Injectable } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";

@Injectable()
export class PermissionsResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /** Permission keys granted to userId within organizationId, or [] if no active membership. */
  async resolve(userId: string, organizationId: string | null): Promise<string[]> {
    if (!organizationId) return [];

    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!membership || !membership.isActive) return [];

    return membership.role.permissions.map((rp) => rp.permission.key);
  }
}
