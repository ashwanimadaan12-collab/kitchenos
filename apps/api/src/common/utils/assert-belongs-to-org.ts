import { NotFoundException } from "@nestjs/common";

/**
 * Shared shape behind every `assert<X>BelongsToOrg` tenant-isolation guard: run the
 * caller's own org-scoped lookup, 404 if nothing came back, otherwise return it. The
 * lookup itself stays with the caller since the where-clause shape varies (a direct
 * `organizationId` column vs. a nested relation filter).
 */
export async function assertBelongsToOrg<T>(find: () => Promise<T | null>, entityName: string): Promise<T> {
  const entity = await find();
  if (!entity) throw new NotFoundException(`${entityName} not found`);
  return entity;
}
