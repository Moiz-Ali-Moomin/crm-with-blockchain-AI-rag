/**
 * One-time remediation script: demote ADMIN users who are not org founders.
 *
 * "Org founder" is defined as the single user whose account was created in the
 * same DB transaction as their tenant row (i.e. their createdAt is within 1 second
 * of the tenant's createdAt and they are the only ADMIN for that tenant at creation).
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/demote-unintended-admins.ts
 *
 * Always run in a transaction with a DRY_RUN first:
 *   DRY_RUN=true npx ts-node -r tsconfig-paths/register prisma/scripts/demote-unintended-admins.ts
 */

import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === 'true';

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE — changes will be persisted'}\n`);

  // Find every tenant and their admin users
  const tenants = await prisma.tenant.findMany({
    include: {
      users: {
        where: { role: UserRole.ADMIN },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  const toDemote: string[] = [];

  for (const tenant of tenants) {
    const admins = tenant.users;

    if (admins.length === 0) continue;

    // The legitimate founder is the earliest-created ADMIN whose createdAt is
    // within 5 seconds of the tenant creation (created in the same transaction).
    const founder = admins.find(
      (u) => Math.abs(u.createdAt.getTime() - tenant.createdAt.getTime()) <= 5_000,
    );

    for (const admin of admins) {
      if (admin.id === founder?.id) {
        console.log(`  [KEEP]   ${admin.email} (${tenant.slug}) — org founder`);
        continue;
      }
      console.log(`  [DEMOTE] ${admin.email} (${tenant.slug}) — unintended ADMIN`);
      toDemote.push(admin.id);
    }
  }

  console.log(`\nTotal to demote: ${toDemote.length}`);

  if (toDemote.length === 0 || DRY_RUN) {
    console.log(DRY_RUN ? '\nDry run complete — no changes made.' : '\nNothing to do.');
    return;
  }

  const result = await prisma.user.updateMany({
    where: { id: { in: toDemote } },
    data: { role: UserRole.SALES_REP },
  });

  console.log(`\nDemoted ${result.count} user(s) to SALES_REP.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
