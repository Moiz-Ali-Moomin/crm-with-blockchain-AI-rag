/**
 * Fix-wonAt script
 *
 * The seed baked `wonAt = daysAgo(N)` at seed-run time.
 * If the seed ran weeks/months ago, those dates are now in past months,
 * so the analytics MTD query returns 0 revenue.
 *
 * This script back-fills WON deals to have wonAt within the current month
 * so the dashboard immediately shows correct revenue.
 *
 * Run once: npx ts-node prisma/fix-won-at.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  console.log('\n🕐 Current time  :', now.toISOString());
  console.log('📅 Month start   :', monthStart.toISOString());

  // Find all WON deals whose wonAt is outside this month (or NULL)
  const staleWonDeals = await prisma.deal.findMany({
    where: {
      status: 'WON',
      OR: [
        { wonAt: { lt: monthStart } },
        { wonAt: null },
      ],
    },
    select: { id: true, title: true, value: true, wonAt: true, createdAt: true },
  });

  const inMonthAlready = await prisma.deal.findMany({
    where: { status: 'WON', wonAt: { gte: monthStart } },
    select: { id: true, title: true, value: true, wonAt: true },
  });

  console.log(`\n✅ WON deals already in this month : ${inMonthAlready.length}`);
  inMonthAlready.forEach(d =>
    console.log(`   ${d.title.padEnd(45)} | wonAt: ${d.wonAt?.toISOString().slice(0, 10)} | $${Number(d.value).toLocaleString()}`),
  );

  console.log(`\n⚠️  WON deals with stale/null wonAt : ${staleWonDeals.length}`);
  staleWonDeals.forEach(d =>
    console.log(`   ${d.title.padEnd(45)} | wonAt: ${d.wonAt?.toISOString().slice(0, 10) ?? 'NULL'} | $${Number(d.value).toLocaleString()}`),
  );

  if (staleWonDeals.length === 0) {
    console.log('\n✅ All WON deals are already in this month. No fix needed.');
    console.log('   → The issue is likely a stale Redis cache. See below.\n');
  } else {
    console.log('\n🔧 Spreading stale WON deals across this month...');
    const daysInMonth = now.getDate(); // days elapsed so far this month

    for (let i = 0; i < staleWonDeals.length; i++) {
      const deal = staleWonDeals[i];
      // Spread WON dates evenly across days elapsed in the current month
      const dayOffset = Math.floor((i / staleWonDeals.length) * (daysInMonth - 1));
      const newWonAt = new Date(monthStart);
      newWonAt.setDate(monthStart.getDate() + dayOffset);
      newWonAt.setHours(10, 0, 0, 0);

      await prisma.deal.update({
        where: { id: deal.id },
        data: { wonAt: newWonAt },
      });
      console.log(`   ✅ ${deal.title.padEnd(45)} | ${deal.wonAt?.toISOString().slice(0, 10) ?? 'NULL'} → ${newWonAt.toISOString().slice(0, 10)}`);
    }

    const totalRevenue = staleWonDeals.reduce((s, d) => s + Number(d.value), 0);
    console.log(`\n💰 Revenue now visible this month: $${totalRevenue.toLocaleString()}`);
    console.log('\n✅ wonAt back-fill complete.');
  }

  console.log('\n⚠️  IMPORTANT: Clear Redis cache so the dashboard picks up the new data.');
  console.log('   Run: redis-cli -a $REDIS_PASSWORD DEL "analytics:dashboard:<your-tenantId>"\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Script failed:', e.message);
  process.exit(1);
});
