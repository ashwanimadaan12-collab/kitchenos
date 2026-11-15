/**
 * Run once against a brand-new production database, before the first self-service signup
 * (`POST /v1/auth/signup`) — it needs the permission catalogue to already exist, since signup
 * grants a new org's admin every permission except `platform:manage` by reading this table
 * (`AuthService.signup`), not from a hardcoded list. Unlike `seed.ts`, this creates no
 * organization, no demo data, nothing — a real deployment should never carry KitchenOS's own
 * demo restaurant and fake orders into what a paying customer sees.
 */
import { PrismaClient } from "../generated/client/index.js";
import { PERMISSIONS_CATALOGUE } from "./permissions-catalogue.js";

const prisma = new PrismaClient();

async function main() {
  await prisma.permission.createMany({
    data: PERMISSIONS_CATALOGUE.map((p) => ({ key: p.key, description: p.description })),
    skipDuplicates: true,
  });
  console.log(`Seeded ${PERMISSIONS_CATALOGUE.length} permissions. No organization or demo data was created.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
