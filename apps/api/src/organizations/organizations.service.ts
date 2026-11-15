import { Injectable } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  /** Organizations the given user has an active membership in — backs the org selector. */
  async findForUser(userId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, isActive: true },
      include: { organization: true },
    });
    return memberships.map((m) => m.organization);
  }
}
