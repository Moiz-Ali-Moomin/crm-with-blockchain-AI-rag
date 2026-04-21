import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const now = new Date();
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

console.log('\n🕐 Now:       ', now.toISOString());
console.log('📅 MonthStart:', monthStart.toISOString());

const won = await prisma.deal.findMany({
  where: { status: 'WON' },
  select: { title: true, value: true, wonAt: true, createdAt: true, tenantId: true },
});

console.log('\n🏆 WON DEALS (' + won.length + ' total):');
let revenueThisMonth = 0;
for (const d of won) {
  const inMonth = d.wonAt ? d.wonAt >= monthStart : (d.createdAt >= monthStart);
  if (inMonth) revenueThisMonth += Number(d.value);
  console.log(
    (inMonth ? '  ✅' : '  ❌'),
    `${d.title.padEnd(40)} | value: $${Number(d.value).toLocaleString().padStart(8)}`,
    `| wonAt: ${d.wonAt ? d.wonAt.toISOString().slice(0,10) : 'NULL (using createdAt: ' + d.createdAt.toISOString().slice(0,10) + ')'}`,
  );
}
console.log('\n💰 Revenue this month (with NULL fallback):', '$' + revenueThisMonth.toLocaleString());

const allDeals = await prisma.deal.groupBy({ by: ['status'], _count: { id: true }, _sum: { value: true } });
console.log('\n📊 ALL DEALS BY STATUS:');
allDeals.forEach(d => console.log(`  ${d.status}: ${d._count.id} deals, $${Number(d._sum.value).toLocaleString()}`));

const leads = await prisma.lead.groupBy({ by: ['status'], _count: { id: true } });
console.log('\n👤 LEADS BY STATUS:');
leads.forEach(l => console.log(`  ${l.status}: ${l._count.id}`));

const converted = await prisma.lead.findMany({
  where: { status: 'CONVERTED' },
  select: { firstName: true, lastName: true, convertedAt: true, createdAt: true },
});
console.log('\n🔄 CONVERTED LEADS (' + converted.length + ' total):');
converted.forEach(l => console.log(
  `  ${l.firstName} ${l.lastName} | convertedAt: ${l.convertedAt?.toISOString().slice(0,10) ?? 'NULL'} | createdAt: ${l.createdAt.toISOString().slice(0,10)}`,
));

await prisma.$disconnect();
