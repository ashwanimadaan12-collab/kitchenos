import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import type { CreateComboDto } from "./dto/create-combo.dto.js";
import type { UpdateComboDto } from "./dto/update-combo.dto.js";
import type { AddComboItemDto } from "./dto/add-combo-item.dto.js";
import type { UpdateComboItemDto } from "./dto/update-combo-item.dto.js";

const COMBO_INCLUDE = {
  brand: true,
  items: { include: { variant: { include: { product: true } } } },
};

@Injectable()
export class CombosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, brandId?: string) {
    return this.prisma.combo.findMany({
      where: { organizationId, ...(brandId ? { brandId } : {}) },
      orderBy: { name: "asc" },
      include: COMBO_INCLUDE,
    });
  }

  async findOne(organizationId: string, id: string) {
    const combo = await this.prisma.combo.findFirst({ where: { id, organizationId }, include: COMBO_INCLUDE });
    if (!combo) throw new NotFoundException("Combo not found");
    return combo;
  }

  /** Every component variant must belong to the combo's own brand. */
  async create(organizationId: string, dto: CreateComboDto) {
    const brand = await this.prisma.brand.findFirst({ where: { id: dto.brandId, organizationId } });
    if (!brand) throw new NotFoundException("Brand not found");

    const variantIds = dto.items.map((i) => i.variantId);
    if (new Set(variantIds).size !== variantIds.length) {
      throw new BadRequestException("A combo cannot list the same variant twice");
    }
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, product: { organizationId, brandId: brand.id } },
    });
    if (variants.length !== variantIds.length) {
      throw new NotFoundException("One or more product variants were not found for this brand");
    }

    try {
      return await this.prisma.combo.create({
        data: {
          organizationId,
          brandId: brand.id,
          name: dto.name,
          description: dto.description,
          comboPrice: dto.comboPrice,
          items: { create: dto.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) },
        },
        include: COMBO_INCLUDE,
      });
    } catch (err) {
      throw this.mapUniqueError(err, "A combo with this name already exists for this brand");
    }
  }

  async update(organizationId: string, id: string, dto: UpdateComboDto) {
    await this.findOne(organizationId, id);
    try {
      return await this.prisma.combo.update({ where: { id }, data: dto, include: COMBO_INCLUDE });
    } catch (err) {
      throw this.mapUniqueError(err, "A combo with this name already exists for this brand");
    }
  }

  /** Adds a component. The variant must belong to the combo's own brand. */
  async addItem(organizationId: string, comboId: string, dto: AddComboItemDto) {
    const combo = await this.findOne(organizationId, comboId);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.variantId, product: { organizationId, brandId: combo.brandId } },
    });
    if (!variant) throw new NotFoundException("Product variant not found for this brand");

    try {
      return await this.prisma.comboItem.create({
        data: { comboId, variantId: variant.id, quantity: dto.quantity },
        include: { variant: { include: { product: true } } },
      });
    } catch (err) {
      throw this.mapDuplicateLineError(err);
    }
  }

  async updateItem(organizationId: string, comboId: string, variantId: string, dto: UpdateComboItemDto) {
    await this.findOne(organizationId, comboId);
    const line = await this.prisma.comboItem.findFirst({ where: { comboId, variantId } });
    if (!line) throw new NotFoundException("Combo item line not found");

    return this.prisma.comboItem.update({
      where: { id: line.id },
      data: { quantity: dto.quantity },
      include: { variant: { include: { product: true } } },
    });
  }

  /** Refuses to drop a combo below two components — a one-item "combo" breaks price allocation. */
  async removeItem(organizationId: string, comboId: string, variantId: string) {
    const combo = await this.findOne(organizationId, comboId);
    if (combo.items.length <= 2) {
      throw new ConflictException("A combo must keep at least two component items");
    }
    await this.prisma.comboItem.deleteMany({ where: { comboId, variantId } });
    return { success: true } as const;
  }

  private mapUniqueError(err: unknown, message: string): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException(message);
    }
    return err as Error;
  }

  private mapDuplicateLineError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException("This variant is already a component of the combo");
    }
    return err as Error;
  }
}
