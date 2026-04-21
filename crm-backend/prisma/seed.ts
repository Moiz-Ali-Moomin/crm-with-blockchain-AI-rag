/**
 * Prisma Seed Script — Rich Demo Data
 * Creates a realistic dataset optimized for AI Copilot demos.
 * Includes deliberate patterns: stale deals, hot uncontacted leads,
 * email engagement signals, closing-soon opportunities, and rep performance gaps.
 *
 * Run with: npx ts-node prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);
const daysFromNow = (d: number) => new Date(now.getTime() + d * DAY);

async function main() {
  console.log('🌱 Starting seed...');

  // ─── Tenant ────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      domain: 'acme.com',
      plan: 'PRO',
      isActive: true,
      settings: {
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        currency: 'USD',
        aiCopilotEnabled: true,
      },
    },
  });
  console.log(`✅ Tenant: ${tenant.name}`);

  // ─── Users ─────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@acme.com' } },
    update: {},
    create: { tenantId: tenant.id, email: 'admin@acme.com', passwordHash, firstName: 'Alice', lastName: 'Admin', role: 'ADMIN', status: 'ACTIVE', jobTitle: 'CRM Administrator', timezone: 'America/New_York' },
  });

  const salesManager = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'manager@acme.com' } },
    update: {},
    create: { tenantId: tenant.id, email: 'manager@acme.com', passwordHash, firstName: 'Bob', lastName: 'Manager', role: 'SALES_MANAGER', status: 'ACTIVE', jobTitle: 'Sales Manager', timezone: 'America/New_York' },
  });

  const salesRep1 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'sarah@acme.com' } },
    update: {},
    create: { tenantId: tenant.id, email: 'sarah@acme.com', passwordHash, firstName: 'Sarah', lastName: 'Smith', role: 'SALES_REP', status: 'ACTIVE', jobTitle: 'Account Executive', timezone: 'America/Chicago' },
  });

  const salesRep2 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'john@acme.com' } },
    update: {},
    create: { tenantId: tenant.id, email: 'john@acme.com', passwordHash, firstName: 'John', lastName: 'Doe', role: 'SALES_REP', status: 'ACTIVE', jobTitle: 'Account Executive', timezone: 'America/Los_Angeles' },
  });

  const salesRep3 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'priya@acme.com' } },
    update: {},
    create: { tenantId: tenant.id, email: 'priya@acme.com', passwordHash, firstName: 'Priya', lastName: 'Patel', role: 'SALES_REP', status: 'ACTIVE', jobTitle: 'Senior Account Executive', timezone: 'America/New_York' },
  });

  const supportAgent = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'support@acme.com' } },
    update: {},
    create: { tenantId: tenant.id, email: 'support@acme.com', passwordHash, firstName: 'Mike', lastName: 'Support', role: 'SUPPORT_AGENT', status: 'ACTIVE', jobTitle: 'Customer Support Lead', timezone: 'America/New_York' },
  });

  console.log(`✅ Users: 6 created`);

  // ─── Pipelines & Stages ────────────────────────────────────────────────────
  // Pipeline 1: Sales Pipeline (default)
  const existingSalesPipeline = await prisma.pipeline.findFirst({ where: { tenantId: tenant.id, name: 'Sales Pipeline' } });
  let salesPipeline = existingSalesPipeline;
  if (!salesPipeline) {
    salesPipeline = await prisma.pipeline.create({
      data: { tenantId: tenant.id, name: 'Sales Pipeline', isDefault: true },
    });
    for (const s of [
      { name: 'Prospecting',   position: 0, probability: 0.1,  color: '#94a3b8', isWon: false, isLost: false },
      { name: 'Qualification', position: 1, probability: 0.25, color: '#60a5fa', isWon: false, isLost: false },
      { name: 'Proposal',      position: 2, probability: 0.5,  color: '#a78bfa', isWon: false, isLost: false },
      { name: 'Negotiation',   position: 3, probability: 0.75, color: '#f59e0b', isWon: false, isLost: false },
      { name: 'Closed Won',    position: 4, probability: 1.0,  color: '#22c55e', isWon: true,  isLost: false },
      { name: 'Closed Lost',   position: 5, probability: 0.0,  color: '#ef4444', isWon: false, isLost: true  },
    ]) {
      await prisma.stage.create({ data: { ...s, pipelineId: salesPipeline.id, tenantId: tenant.id } });
    }
  }

  // Pipeline 2: Renewal Pipeline
  const existingRenewalPipeline = await prisma.pipeline.findFirst({ where: { tenantId: tenant.id, name: 'Renewal Pipeline' } });
  let renewalPipeline = existingRenewalPipeline;
  if (!renewalPipeline) {
    renewalPipeline = await prisma.pipeline.create({
      data: { tenantId: tenant.id, name: 'Renewal Pipeline', isDefault: false },
    });
    for (const s of [
      { name: 'Up for Renewal',    position: 0, probability: 0.6,  color: '#94a3b8', isWon: false, isLost: false },
      { name: 'Renewal Sent',      position: 1, probability: 0.75, color: '#60a5fa', isWon: false, isLost: false },
      { name: 'In Negotiation',    position: 2, probability: 0.85, color: '#f59e0b', isWon: false, isLost: false },
      { name: 'Renewed',           position: 3, probability: 1.0,  color: '#22c55e', isWon: true,  isLost: false },
      { name: 'Churned',           position: 4, probability: 0.0,  color: '#ef4444', isWon: false, isLost: true  },
    ]) {
      await prisma.stage.create({ data: { ...s, pipelineId: renewalPipeline.id, tenantId: tenant.id } });
    }
  }

  const salesStages = await prisma.stage.findMany({ where: { pipelineId: salesPipeline.id }, orderBy: { position: 'asc' } });
  const renewalStages = await prisma.stage.findMany({ where: { pipelineId: renewalPipeline.id }, orderBy: { position: 'asc' } });

  console.log(`✅ Pipelines: Sales (${salesStages.length} stages) + Renewal (${renewalStages.length} stages)`);

  // ─── Companies ─────────────────────────────────────────────────────────────
  const companiesData = [
    { name: 'TechVision Inc',        industry: 'Technology',          employeeCount: 250,  annualRevenue: 15000000,  website: 'https://techvision.com',      city: 'San Francisco', country: 'USA' },
    { name: 'Global Retail Co',      industry: 'Retail',              employeeCount: 1200, annualRevenue: 85000000,  website: 'https://globalretail.com',     city: 'Chicago',       country: 'USA' },
    { name: 'Healthcare Plus',       industry: 'Healthcare',          employeeCount: 500,  annualRevenue: 32000000,  website: 'https://healthcareplus.com',   city: 'Boston',        country: 'USA' },
    { name: 'FinServ Partners',      industry: 'Financial Services',  employeeCount: 180,  annualRevenue: 22000000,  website: 'https://finservpartners.com',  city: 'New York',      country: 'USA' },
    { name: 'EduTech Academy',       industry: 'Education',           employeeCount: 90,   annualRevenue: 5500000,   website: 'https://edutech.com',          city: 'Austin',        country: 'USA' },
    { name: 'Nexus Logistics',       industry: 'Logistics',           employeeCount: 650,  annualRevenue: 48000000,  website: 'https://nexuslogistics.com',   city: 'Dallas',        country: 'USA' },
    { name: 'CloudStream Media',     industry: 'Media & Entertainment',employeeCount: 320, annualRevenue: 27000000,  website: 'https://cloudstreammedia.com', city: 'Los Angeles',   country: 'USA' },
    { name: 'BioCore Research',      industry: 'Biotechnology',       employeeCount: 140,  annualRevenue: 18000000,  website: 'https://biocore.com',          city: 'Cambridge',     country: 'USA' },
    { name: 'Pinnacle Construction', industry: 'Construction',        employeeCount: 800,  annualRevenue: 62000000,  website: 'https://pinnacleconstruction.com', city: 'Houston',  country: 'USA' },
    { name: 'Orion Energy',          industry: 'Energy',              employeeCount: 430,  annualRevenue: 95000000,  website: 'https://orionenergy.com',      city: 'Denver',        country: 'USA' },
    { name: 'Vertex Analytics',      industry: 'SaaS',                employeeCount: 75,   annualRevenue: 8200000,   website: 'https://vertexanalytics.io',   city: 'Seattle',       country: 'USA' },
    { name: 'MediTrust Group',       industry: 'Healthcare',          employeeCount: 220,  annualRevenue: 19000000,  website: 'https://meditrust.com',        city: 'Philadelphia',  country: 'USA' },
  ];

  const companies: any[] = [];
  for (const c of companiesData) {
    const existing = await prisma.company.findFirst({ where: { tenantId: tenant.id, name: c.name } });
    if (existing) {
      companies.push(existing);
    } else {
      const company = await prisma.company.create({
        data: { ...c, tenantId: tenant.id, ownerId: salesManager.id },
      });
      companies.push(company);
    }
  }
  console.log(`✅ Companies: ${companies.length}`);

  // ─── Contacts ──────────────────────────────────────────────────────────────
  const contactsRaw = [
    // TechVision (0)
    { firstName: 'David',    lastName: 'Chen',      email: 'david.chen@techvision.com',      phone: '+1-415-555-0101', mobile: '+1-415-555-0191', jobTitle: 'CTO',                 department: 'Engineering',   companyIdx: 0,  assigneeIdx: 'rep1', lastContactedAt: daysAgo(3),  totalSpent: 45000,  tags: ['key-decision-maker', 'technical'] },
    { firstName: 'Amanda',   lastName: 'Wilson',    email: 'amanda@techvision.com',           phone: '+1-415-555-0106', mobile: null,              jobTitle: 'Head of Sales',       department: 'Sales',         companyIdx: 0,  assigneeIdx: 'rep1', lastContactedAt: daysAgo(8),  totalSpent: 12000,  tags: ['champion', 'influencer'] },
    // Global Retail (1)
    { firstName: 'Emma',     lastName: 'Johnson',   email: 'emma.j@globalretail.com',         phone: '+1-312-555-0102', mobile: '+1-312-555-0192', jobTitle: 'VP Operations',       department: 'Operations',    companyIdx: 1,  assigneeIdx: 'rep2', lastContactedAt: daysAgo(1),  totalSpent: 120000, tags: ['vp', 'operations'] },
    { firstName: 'Kevin',    lastName: 'Park',      email: 'k.park@globalretail.com',         phone: '+1-312-555-0112', mobile: null,              jobTitle: 'IT Director',         department: 'IT',            companyIdx: 1,  assigneeIdx: 'rep2', lastContactedAt: daysAgo(15), totalSpent: 8000,   tags: ['technical-evaluator'] },
    // Healthcare Plus (2)
    { firstName: 'James',    lastName: 'Williams',  email: 'j.williams@healthcareplus.com',   phone: '+1-617-555-0103', mobile: '+1-617-555-0193', jobTitle: 'Director of IT',      department: 'IT',            companyIdx: 2,  assigneeIdx: 'rep1', lastContactedAt: daysAgo(21), totalSpent: 55000,  tags: ['director', 'budget-holder'] },
    { firstName: 'Nina',     lastName: 'Roberts',   email: 'n.roberts@healthcareplus.com',    phone: '+1-617-555-0113', mobile: null,              jobTitle: 'CMO',                 department: 'Marketing',     companyIdx: 2,  assigneeIdx: 'rep3', lastContactedAt: daysAgo(5),  totalSpent: 0,      tags: ['new-contact', 'c-suite'] },
    // FinServ Partners (3)
    { firstName: 'Lisa',     lastName: 'Brown',     email: 'lisa.b@finservpartners.com',      phone: '+1-212-555-0104', mobile: '+1-212-555-0194', jobTitle: 'CFO',                 department: 'Finance',       companyIdx: 3,  assigneeIdx: 'rep2', lastContactedAt: daysAgo(2),  totalSpent: 95000,  tags: ['cfo', 'deal-signer'] },
    { firstName: 'Robert',   lastName: 'Chang',     email: 'r.chang@finservpartners.com',     phone: '+1-212-555-0114', mobile: null,              jobTitle: 'VP Technology',       department: 'Technology',    companyIdx: 3,  assigneeIdx: 'rep3', lastContactedAt: daysAgo(10), totalSpent: 0,      tags: ['vp', 'technical'] },
    // EduTech (4)
    { firstName: 'Tom',      lastName: 'Davis',     email: 'tom.d@edutech.com',               phone: '+1-650-555-0105', mobile: '+1-650-555-0195', jobTitle: 'CEO',                 department: 'Executive',     companyIdx: 4,  assigneeIdx: 'rep1', lastContactedAt: daysAgo(30), totalSpent: 28000,  tags: ['ceo', 'champion'] },
    // Nexus Logistics (5)
    { firstName: 'Carlos',   lastName: 'Rivera',    email: 'c.rivera@nexuslogistics.com',     phone: '+1-214-555-0115', mobile: '+1-214-555-0195', jobTitle: 'COO',                 department: 'Operations',    companyIdx: 5,  assigneeIdx: 'rep3', lastContactedAt: daysAgo(4),  totalSpent: 0,      tags: ['coo', 'evaluating'] },
    { firstName: 'Sandra',   lastName: 'Lee',       email: 's.lee@nexuslogistics.com',        phone: '+1-214-555-0125', mobile: null,              jobTitle: 'Head of Tech',        department: 'Technology',    companyIdx: 5,  assigneeIdx: 'rep3', lastContactedAt: daysAgo(4),  totalSpent: 0,      tags: ['technical-lead'] },
    // CloudStream Media (6)
    { firstName: 'Marcus',   lastName: 'Thompson',  email: 'm.thompson@cloudstreammedia.com', phone: '+1-310-555-0116', mobile: '+1-310-555-0196', jobTitle: 'CEO',                 department: 'Executive',     companyIdx: 6,  assigneeIdx: 'rep2', lastContactedAt: daysAgo(7),  totalSpent: 0,      tags: ['ceo', 'high-value'] },
    // BioCore Research (7)
    { firstName: 'Dr. Sarah', lastName: 'Kim',     email: 's.kim@biocore.com',               phone: '+1-617-555-0117', mobile: null,              jobTitle: 'Research Director',   department: 'Research',      companyIdx: 7,  assigneeIdx: 'rep1', lastContactedAt: daysAgo(12), totalSpent: 18000,  tags: ['director', 'research'] },
    // Pinnacle Construction (8)
    { firstName: 'Greg',     lastName: 'Foster',    email: 'g.foster@pinnacleconstruction.com',phone: '+1-713-555-0118', mobile: '+1-713-555-0198', jobTitle: 'CIO',                 department: 'IT',            companyIdx: 8,  assigneeIdx: 'rep2', lastContactedAt: daysAgo(45), totalSpent: 0,      tags: ['cio', 'stale-contact'] },
    // Orion Energy (9)
    { firstName: 'Patricia', lastName: 'Moore',     email: 'p.moore@orionenergy.com',         phone: '+1-303-555-0119', mobile: '+1-303-555-0199', jobTitle: 'VP Finance',          department: 'Finance',       companyIdx: 9,  assigneeIdx: 'rep3', lastContactedAt: daysAgo(6),  totalSpent: 0,      tags: ['vp', 'budget-holder'] },
    { firstName: 'Derek',    lastName: 'Walsh',     email: 'd.walsh@orionenergy.com',         phone: '+1-303-555-0129', mobile: null,              jobTitle: 'Director of Digital', department: 'Technology',    companyIdx: 9,  assigneeIdx: 'rep3', lastContactedAt: daysAgo(6),  totalSpent: 0,      tags: ['digital-transformation'] },
    // Vertex Analytics (10)
    { firstName: 'Angela',   lastName: 'Reyes',     email: 'a.reyes@vertexanalytics.io',      phone: '+1-206-555-0120', mobile: null,              jobTitle: 'Founder & CEO',       department: 'Executive',     companyIdx: 10, assigneeIdx: 'rep1', lastContactedAt: daysAgo(2),  totalSpent: 0,      tags: ['founder', 'high-interest'] },
    // MediTrust Group (11)
    { firstName: 'Howard',   lastName: 'Banks',     email: 'h.banks@meditrust.com',           phone: '+1-215-555-0121', mobile: '+1-215-555-0191', jobTitle: 'CFO',                 department: 'Finance',       companyIdx: 11, assigneeIdx: 'rep2', lastContactedAt: daysAgo(19), totalSpent: 0,      tags: ['cfo', 'renewal-risk'] },
    { firstName: 'Grace',    lastName: 'Nguyen',    email: 'g.nguyen@meditrust.com',          phone: '+1-215-555-0131', mobile: null,              jobTitle: 'IT Manager',          department: 'IT',            companyIdx: 11, assigneeIdx: 'rep2', lastContactedAt: daysAgo(19), totalSpent: 0,      tags: ['technical-lead', 'power-user'] },
    // Global Retail extra (1)
    { firstName: 'Fiona',    lastName: 'Clarke',    email: 'f.clarke@globalretail.com',       phone: '+1-312-555-0122', mobile: null,              jobTitle: 'Head of Procurement', department: 'Procurement',   companyIdx: 1,  assigneeIdx: 'mgr', lastContactedAt: daysAgo(9),  totalSpent: 35000,  tags: ['procurement', 'key-influencer'] },
  ];

  const repMap: any = { rep1: salesRep1.id, rep2: salesRep2.id, rep3: salesRep3.id, mgr: salesManager.id };

  const contacts: any[] = [];
  for (const c of contactsRaw) {
    const existing = await prisma.contact.findFirst({ where: { tenantId: tenant.id, email: c.email } });
    if (existing) {
      contacts.push(existing);
    } else {
      const { companyIdx, assigneeIdx, ...contactData } = c;
      const contact = await prisma.contact.create({
        data: {
          ...contactData,
          tenantId: tenant.id,
          companyId: companies[companyIdx].id,
          assigneeId: repMap[assigneeIdx] ?? null,
        } as any,
      });
      contacts.push(contact);
    }
  }
  console.log(`✅ Contacts: ${contacts.length}`);

  // Helper: find contact by email
  const byEmail = (email: string) => contacts.find(c => c.email === email)!;
  const byCompanyName = (name: string) => companies.find(c => c.name === name)!;

  // ─── Leads ─────────────────────────────────────────────────────────────────
  // Deliberate patterns for AI:
  // - High-score leads not yet contacted (AI should flag)
  // - Leads from high-converting sources
  // - Overdue nurturing leads
  const leadsRaw = [
    // Freshly inbound — high score, no assignee → AI should recommend assignment
    { firstName: 'Rachel',    lastName: 'Green',     email: 'rachel@startup.io',         phone: '+1-408-555-0201', companyName: 'Startup.io',          jobTitle: 'CTO',             source: 'WEBSITE',       status: 'NEW',        score: 88,  notes: 'Visited pricing page 4 times. Downloaded enterprise datasheet. Signed up for webinar.',                         assigneeId: null,          createdAt: daysAgo(1),  lastContactedAt: null, tags: ['hot-lead', 'inbound', 'high-intent'] },
    { firstName: 'Jordan',    lastName: 'Wells',     email: 'j.wells@quantumleap.ai',    phone: '+1-650-555-0211', companyName: 'QuantumLeap AI',       jobTitle: 'VP Engineering',  source: 'WEBSITE',       status: 'NEW',        score: 92,  notes: 'Requested a personalized demo. Company raised Series B ($40M). 150 engineers.',                                   assigneeId: null,          createdAt: daysAgo(2),  lastContactedAt: null, tags: ['hot-lead', 'series-b', 'demo-requested'] },
    { firstName: 'Priya',     lastName: 'Shah',      email: 'priya@novalabs.tech',       phone: '+1-512-555-0221', companyName: 'Nova Labs',            jobTitle: 'Head of Sales Ops',source: 'REFERRAL',     status: 'NEW',        score: 85,  notes: 'Referred by TechVision (David Chen). Looking to replace Salesforce.',                                            assigneeId: null,          createdAt: daysAgo(3),  lastContactedAt: null, tags: ['referral', 'salesforce-migration', 'high-value'] },

    // Contacted leads — pending follow-up
    { firstName: 'Marcus',    lastName: 'White',     email: 'marcus@bigcorp.com',        phone: '+1-202-555-0202', companyName: 'BigCorp Inc',          jobTitle: 'Director of IT',  source: 'REFERRAL',      status: 'CONTACTED',  score: 78,  notes: 'Had intro call 2 weeks ago. Sent overview deck. Awaiting budget confirmation from CFO.',                          assigneeId: salesRep1.id,  createdAt: daysAgo(18), lastContactedAt: daysAgo(14), tags: ['follow-up-needed', 'referral'] },
    { firstName: 'Isabella',  lastName: 'Thomas',    email: 'isabella@retail.net',       phone: '+1-312-555-0207', companyName: 'Retail Networks',      jobTitle: 'CIO',             source: 'TRADE_SHOW',    status: 'CONTACTED',  score: 62,  notes: 'Met at NRF Expo. Interested in omnichannel module. Requested pricing for 200 seats.',                            assigneeId: salesRep2.id,  createdAt: daysAgo(12), lastContactedAt: daysAgo(10), tags: ['trade-show', 'follow-up-needed'] },
    { firstName: 'Ahmed',     lastName: 'Hassan',    email: 'a.hassan@metatech.io',      phone: '+1-408-555-0231', companyName: 'MetaTech IO',          jobTitle: 'CEO',             source: 'SOCIAL_MEDIA',  status: 'CONTACTED',  score: 71,  notes: 'Responded to LinkedIn outreach. 45-min discovery call scheduled for next week.',                                 assigneeId: salesRep3.id,  createdAt: daysAgo(7),  lastContactedAt: daysAgo(5),  tags: ['outbound', 'linkedin', 'call-scheduled'] },

    // Qualified leads — in active evaluation
    { firstName: 'Sophia',    lastName: 'Martinez',  email: 'sophia@designco.com',       phone: '+1-305-555-0203', companyName: 'Design Co',            jobTitle: 'COO',             source: 'SOCIAL_MEDIA',  status: 'QUALIFIED',  score: 90,  notes: 'Completed discovery. 3 stakeholders involved. Ready for product demo next week. Budget: $50k/yr approved.',         assigneeId: salesRep2.id,  createdAt: daysAgo(20), lastContactedAt: daysAgo(3),  tags: ['qualified', 'demo-ready', 'budget-approved'] },
    { firstName: 'William',   lastName: 'Jackson',   email: 'william@enterprise.com',    phone: '+1-214-555-0206', companyName: 'Enterprise Solutions', jobTitle: 'IT Director',     source: 'COLD_CALL',     status: 'QUALIFIED',  score: 74,  notes: 'Current CRM contract expires in 90 days. Actively evaluating 3 vendors including us.',                           assigneeId: salesRep1.id,  createdAt: daysAgo(25), lastContactedAt: daysAgo(4),  tags: ['qualified', 'competitive-eval', 'time-sensitive'] },
    { firstName: 'Yuki',      lastName: 'Tanaka',    email: 'y.tanaka@futurepath.jp',    phone: '+81-3-5555-0241', companyName: 'FuturePath Japan',     jobTitle: 'Digital Director',source: 'PARTNER',       status: 'QUALIFIED',  score: 80,  notes: 'Partner introduction through Deloitte Japan. Looking for APAC CRM solution. 500 users.',                          assigneeId: salesRep3.id,  createdAt: daysAgo(14), lastContactedAt: daysAgo(2),  tags: ['qualified', 'international', 'partner-intro'] },

    // Nurturing — AI can suggest re-engagement campaigns
    { firstName: 'Daniel',    lastName: 'Taylor',    email: 'daniel@mediagroup.com',     phone: '+1-617-555-0204', companyName: 'Media Group',          jobTitle: 'CMO',             source: 'GOOGLE_ADS',    status: 'NURTURING',  score: 58,  notes: 'Interested but budget frozen until Q2. Added to monthly newsletter. Last opened email 2 weeks ago.',              assigneeId: salesRep2.id,  createdAt: daysAgo(60), lastContactedAt: daysAgo(21), tags: ['nurturing', 'budget-frozen', 'q2-target'] },
    { firstName: 'Olivia',    lastName: 'Anderson',  email: 'olivia@cloudtech.com',      phone: '+1-206-555-0205', companyName: 'CloudTech Solutions',  jobTitle: 'VP Product',      source: 'EMAIL_CAMPAIGN',status: 'NURTURING',  score: 45,  notes: 'Downloaded whitepaper in Dec. Low engagement since. Company grew from 50 to 120 employees.',                     assigneeId: salesRep1.id,  createdAt: daysAgo(90), lastContactedAt: daysAgo(35), tags: ['nurturing', 'low-engagement', 'company-growing'] },
    { firstName: 'Felix',     lastName: 'Müller',    email: 'f.muller@techhaus.de',      phone: '+49-89-5555-0251', companyName: 'TechHaus GmbH',       jobTitle: 'CTO',             source: 'EMAIL_CAMPAIGN',status: 'NURTURING',  score: 55,  notes: 'DACH region prospect. Received 3 nurture emails. High open rate (80%). Has not replied.',                         assigneeId: salesRep3.id,  createdAt: daysAgo(45), lastContactedAt: daysAgo(14), tags: ['nurturing', 'international', 'high-open-rate'] },

    // Unqualified & Lost
    { firstName: 'Ethan',     lastName: 'Harris',    email: 'ethan@fintech.io',          phone: '+1-415-555-0208', companyName: 'FinTech IO',           jobTitle: 'Marketing Analyst',source: 'PARTNER',      status: 'UNQUALIFIED',score: 18,  notes: 'Too small (3-person startup). Recommended free tier or came back in 12 months.',                                assigneeId: null,          createdAt: daysAgo(30), lastContactedAt: daysAgo(30), tags: ['too-small', 'free-tier'] },
    { firstName: 'Brenda',    lastName: 'Fox',       email: 'b.fox@oldschool.biz',       phone: '+1-305-555-0261', companyName: 'OldSchool Inc',        jobTitle: 'Owner',           source: 'COLD_CALL',     status: 'UNQUALIFIED',score: 12,  notes: 'Not a fit. Uses Excel, not interested in digital transformation.',                                              assigneeId: null,          createdAt: daysAgo(50), lastContactedAt: daysAgo(50), tags: ['not-a-fit'] },
  ];

  for (const l of leadsRaw) {
    const existing = await prisma.lead.findFirst({ where: { tenantId: tenant.id, email: l.email } });
    if (!existing) {
      const { assigneeId, createdAt, lastContactedAt, ...leadFields } = l;
      await prisma.lead.create({
        data: {
          ...leadFields,
          tenantId: tenant.id,
          createdById: adminUser.id,
          ...(assigneeId && { assigneeId }),
          ...(lastContactedAt && { lastContactedAt }),
        } as any,
      });
    }
  }
  console.log(`✅ Leads: ${leadsRaw.length}`);

  // ─── Deals ─────────────────────────────────────────────────────────────────
  // AI patterns:
  // - Deals closing soon with no recent activity
  // - High-value deals stuck in Proposal/Negotiation for 30+ days
  // - Won/Lost deals to train recommendations on
  const davidChen = byEmail('david.chen@techvision.com');
  const emmaJohnson = byEmail('emma.j@globalretail.com');
  const jamesWilliams = byEmail('j.williams@healthcareplus.com');
  const lisaBrown = byEmail('lisa.b@finservpartners.com');
  const tomDavis = byEmail('tom.d@edutech.com');
  const carlosRivera = byEmail('c.rivera@nexuslogistics.com');
  const marcusThompson = byEmail('m.thompson@cloudstreammedia.com');
  const drSarahKim = byEmail('s.kim@biocore.com');
  const gregFoster = byEmail('g.foster@pinnacleconstruction.com');
  const patriciaM = byEmail('p.moore@orionenergy.com');
  const angelaReyes = byEmail('a.reyes@vertexanalytics.io');
  const howardBanks = byEmail('h.banks@meditrust.com');
  const fionaClarke = byEmail('f.clarke@globalretail.com');
  const amandaWilson = byEmail('amanda@techvision.com');

  const dealsRaw = [
    // ── Sales Pipeline ──
    // Prospecting (stageIdx 0)
    { title: 'EduTech LMS Integration',            value: 28000,  contactEmail: 'tom.d@edutech.com',               companyName: 'EduTech Academy',       pipelineType: 'sales', stageIdx: 0, status: 'OPEN',  ownerId: salesRep1.id,   closingDate: daysFromNow(60), createdAt: daysAgo(5),  tags: ['new', 'lms'] },
    { title: 'Vertex Analytics CRM Starter',       value: 18000,  contactEmail: 'a.reyes@vertexanalytics.io',      companyName: 'Vertex Analytics',      pipelineType: 'sales', stageIdx: 0, status: 'OPEN',  ownerId: salesRep1.id,   closingDate: daysFromNow(45), createdAt: daysAgo(3),  tags: ['startup', 'high-growth'] },
    { title: 'CloudStream Content CRM',            value: 52000,  contactEmail: 'm.thompson@cloudstreammedia.com', companyName: 'CloudStream Media',     pipelineType: 'sales', stageIdx: 0, status: 'OPEN',  ownerId: salesRep2.id,   closingDate: daysFromNow(75), createdAt: daysAgo(7),  tags: ['media', 'content-ops'] },

    // Qualification (stageIdx 1)
    { title: 'Healthcare Plus Patient Portal',     value: 45000,  contactEmail: 'j.williams@healthcareplus.com',   companyName: 'Healthcare Plus',       pipelineType: 'sales', stageIdx: 1, status: 'OPEN',  ownerId: salesRep1.id,   closingDate: daysFromNow(30), createdAt: daysAgo(14), tags: ['healthcare', 'portal'] },
    { title: 'Global Retail Mobile Commerce',      value: 78000,  contactEmail: 'emma.j@globalretail.com',         companyName: 'Global Retail Co',      pipelineType: 'sales', stageIdx: 1, status: 'OPEN',  ownerId: salesManager.id,closingDate: daysFromNow(45), createdAt: daysAgo(10), tags: ['retail', 'mobile'] },
    { title: 'Nexus Logistics Fleet Management',   value: 94000,  contactEmail: 'c.rivera@nexuslogistics.com',     companyName: 'Nexus Logistics',       pipelineType: 'sales', stageIdx: 1, status: 'OPEN',  ownerId: salesRep3.id,   closingDate: daysFromNow(60), createdAt: daysAgo(8),  tags: ['logistics', 'enterprise'] },

    // Proposal (stageIdx 2) — some stale, AI should flag
    { title: 'TechVision CRM Enterprise License',  value: 150000, contactEmail: 'david.chen@techvision.com',       companyName: 'TechVision Inc',        pipelineType: 'sales', stageIdx: 2, status: 'OPEN',  ownerId: salesRep1.id,   closingDate: daysFromNow(15), createdAt: daysAgo(35), tags: ['enterprise', 'flagship', 'closing-soon'] },
    { title: 'BioCore Research Data Platform',     value: 67000,  contactEmail: 's.kim@biocore.com',               companyName: 'BioCore Research',      pipelineType: 'sales', stageIdx: 2, status: 'OPEN',  ownerId: salesRep1.id,   closingDate: daysFromNow(21), createdAt: daysAgo(28), tags: ['research', 'data-platform'] },
    { title: 'Global Retail Inventory Suite',      value: 120000, contactEmail: 'f.clarke@globalretail.com',       companyName: 'Global Retail Co',      pipelineType: 'sales', stageIdx: 2, status: 'OPEN',  ownerId: salesRep2.id,   closingDate: daysFromNow(10), createdAt: daysAgo(40), tags: ['enterprise', 'inventory', 'closing-soon', 'stale'] },
    { title: 'Orion Energy Operations Hub',        value: 110000, contactEmail: 'p.moore@orionenergy.com',          companyName: 'Orion Energy',          pipelineType: 'sales', stageIdx: 2, status: 'OPEN',  ownerId: salesRep3.id,   closingDate: daysFromNow(25), createdAt: daysAgo(22), tags: ['energy', 'operations'] },

    // Negotiation (stageIdx 3) — high value, needs attention
    { title: 'Pinnacle Construction Field CRM',    value: 85000,  contactEmail: 'g.foster@pinnacleconstruction.com',companyName: 'Pinnacle Construction', pipelineType: 'sales', stageIdx: 3, status: 'OPEN',  ownerId: salesRep2.id,   closingDate: daysFromNow(7),  createdAt: daysAgo(50), tags: ['construction', 'negotiation', 'at-risk', 'closing-very-soon'] },
    { title: 'MediTrust Compliance Suite',         value: 72000,  contactEmail: 'h.banks@meditrust.com',            companyName: 'MediTrust Group',       pipelineType: 'sales', stageIdx: 3, status: 'OPEN',  ownerId: salesRep2.id,   closingDate: daysFromNow(14), createdAt: daysAgo(42), tags: ['healthcare', 'compliance'] },
    { title: 'FinServ Partners Analytics Suite',   value: 95000,  contactEmail: 'lisa.b@finservpartners.com',       companyName: 'FinServ Partners',      pipelineType: 'sales', stageIdx: 3, status: 'OPEN',  ownerId: salesRep2.id,   closingDate: daysFromNow(12), createdAt: daysAgo(38), tags: ['financial', 'analytics', 'high-value'] },

    // Closed Won
    { title: 'FinServ Risk Dashboard (Yr1)',        value: 48000,  contactEmail: 'lisa.b@finservpartners.com',       companyName: 'FinServ Partners',      pipelineType: 'sales', stageIdx: 4, status: 'WON',   ownerId: salesRep2.id,   closingDate: daysAgo(30),    createdAt: daysAgo(90), wonAt: daysAgo(30), tags: ['won', 'reference-customer'] },
    { title: 'TechVision Support Contract',        value: 22000,  contactEmail: 'amanda@techvision.com',            companyName: 'TechVision Inc',        pipelineType: 'sales', stageIdx: 4, status: 'WON',   ownerId: salesRep1.id,   closingDate: daysAgo(15),    createdAt: daysAgo(60), wonAt: daysAgo(15), tags: ['won', 'upsell'] },
    { title: 'BioCore Lab Management (Pilot)',      value: 18000,  contactEmail: 's.kim@biocore.com',               companyName: 'BioCore Research',      pipelineType: 'sales', stageIdx: 4, status: 'WON',   ownerId: salesRep1.id,   closingDate: daysAgo(45),    createdAt: daysAgo(120),wonAt: daysAgo(45), tags: ['won', 'pilot'] },
    { title: 'EduTech Starter (Pilot)',             value: 8000,   contactEmail: 'tom.d@edutech.com',               companyName: 'EduTech Academy',       pipelineType: 'sales', stageIdx: 4, status: 'WON',   ownerId: salesRep1.id,   closingDate: daysAgo(60),    createdAt: daysAgo(130),wonAt: daysAgo(60), tags: ['won', 'pilot-upsell'] },

    // Closed Lost — AI learns patterns
    { title: 'Healthcare Plus Billing System',      value: 55000,  contactEmail: 'j.williams@healthcareplus.com',  companyName: 'Healthcare Plus',       pipelineType: 'sales', stageIdx: 5, status: 'LOST',  ownerId: salesRep1.id,   closingDate: daysAgo(20),    createdAt: daysAgo(75), lostReason: 'Chose competitor (Salesforce Health Cloud). Price was not the deciding factor.', tags: ['lost', 'competitor-salesforce'] },
    { title: 'CloudStream Pilot License',           value: 15000,  contactEmail: 'm.thompson@cloudstreammedia.com',companyName: 'CloudStream Media',     pipelineType: 'sales', stageIdx: 5, status: 'LOST',  ownerId: salesRep2.id,   closingDate: daysAgo(10),    createdAt: daysAgo(40), lostReason: 'Budget cut. Team frozen all new SaaS subscriptions.', tags: ['lost', 'budget-cut'] },

    // ── Renewal Pipeline ──
    { title: 'TechVision Annual Renewal',           value: 45000,  contactEmail: 'david.chen@techvision.com',       companyName: 'TechVision Inc',        pipelineType: 'renewal', stageIdx: 0, status: 'OPEN',  ownerId: salesRep1.id,   closingDate: daysFromNow(45), createdAt: daysAgo(10), tags: ['renewal', 'at-risk'] },
    { title: 'FinServ Annual Renewal',              value: 48000,  contactEmail: 'lisa.b@finservpartners.com',       companyName: 'FinServ Partners',      pipelineType: 'renewal', stageIdx: 1, status: 'OPEN',  ownerId: salesRep2.id,   closingDate: daysFromNow(20), createdAt: daysAgo(15), tags: ['renewal', 'expansion-opportunity'] },
    { title: 'BioCore Annual Renewal + Expansion',  value: 28000,  contactEmail: 's.kim@biocore.com',               companyName: 'BioCore Research',      pipelineType: 'renewal', stageIdx: 2, status: 'OPEN',  ownerId: salesRep1.id,   closingDate: daysFromNow(10), createdAt: daysAgo(20), tags: ['renewal', 'expansion'] },
  ];

  for (const d of dealsRaw) {
    const existing = await prisma.deal.findFirst({ where: { tenantId: tenant.id, title: d.title } });
    if (!existing) {
      const { contactEmail, companyName, pipelineType, stageIdx, wonAt, lostReason, createdAt, ...dealData } = d;
      const pipelineId = pipelineType === 'renewal' ? renewalPipeline.id : salesPipeline.id;
      const stageList = pipelineType === 'renewal' ? renewalStages : salesStages;
      const contact = byEmail(contactEmail);
      const company = byCompanyName(companyName);

      await prisma.deal.create({
        data: {
          ...dealData,
          tenantId: tenant.id,
          pipelineId,
          stageId: stageList[stageIdx].id,
          contactId: contact?.id ?? null,
          companyId: company?.id ?? null,
          currency: 'USD',
          ...(wonAt && { wonAt }),
          ...(lostReason && { lostReason }),
        } as any,
      });
    }
  }
  console.log(`✅ Deals: ${dealsRaw.length} across 2 pipelines`);

  // ─── Email / Communications ────────────────────────────────────────────────
  // Realistic email thread data for AI to analyze (opens, clicks, replies)
  const emailsRaw = [
    // Thread: TechVision Enterprise deal
    { channel: 'EMAIL', direction: 'OUTBOUND', status: 'OPENED',    fromAddr: 'sarah@acme.com',    toAddr: 'david.chen@techvision.com',      subject: 'Acme CRM Enterprise Proposal – TechVision Inc',                           body: 'Hi David, following up on our discovery call. Please find the enterprise proposal attached. The proposal includes volume pricing for 80 users and dedicated implementation support.',        htmlBody: null, contactEmail: 'david.chen@techvision.com',       sentById: salesRep1.id,  sentAt: daysAgo(14), openedAt: daysAgo(13), metadata: { opens: 3, clicks: 2, template: 'proposal' } },
    { channel: 'EMAIL', direction: 'INBOUND',  status: 'DELIVERED',  fromAddr: 'david.chen@techvision.com', toAddr: 'sarah@acme.com',         subject: 'Re: Acme CRM Enterprise Proposal – TechVision Inc',                      body: 'Sarah, thanks for the proposal. Can we schedule a call to discuss the implementation timeline? Also our legal team wants to review the DPA.',                                               htmlBody: null, contactEmail: 'david.chen@techvision.com',       sentById: null,          sentAt: daysAgo(12), openedAt: null,       metadata: { replied: true } },
    { channel: 'EMAIL', direction: 'OUTBOUND', status: 'OPENED',    fromAddr: 'sarah@acme.com',    toAddr: 'david.chen@techvision.com',      subject: 'Re: Acme CRM Enterprise Proposal – DPA + Implementation Schedule',         body: 'David, great to hear from you. I have attached the DPA and a sample implementation timeline. Happy to jump on a 30-min call this week.',                                                  htmlBody: null, contactEmail: 'david.chen@techvision.com',       sentById: salesRep1.id,  sentAt: daysAgo(11), openedAt: daysAgo(11), metadata: { opens: 2, clicks: 1, attachments: ['DPA.pdf', 'impl-timeline.pdf'] } },
    { channel: 'EMAIL', direction: 'OUTBOUND', status: 'OPENED',    fromAddr: 'sarah@acme.com',    toAddr: 'david.chen@techvision.com',      subject: 'Following up – Call this week?',                                           body: 'Hi David, just checking in. Are you available Thursday or Friday for a 30-min call? Would love to address any questions before your team\'s review.',                                      htmlBody: null, contactEmail: 'david.chen@techvision.com',       sentById: salesRep1.id,  sentAt: daysAgo(4),  openedAt: daysAgo(4),  metadata: { opens: 1, clicks: 0 } },

    // Thread: Global Retail Inventory
    { channel: 'EMAIL', direction: 'OUTBOUND', status: 'SENT',      fromAddr: 'john@acme.com',     toAddr: 'f.clarke@globalretail.com',      subject: 'Acme CRM – Inventory Management Proposal for Global Retail',               body: 'Hi Fiona, as discussed, please find the inventory management suite proposal. Pricing is based on 1,200 concurrent users with premium support SLA.',                                        htmlBody: null, contactEmail: 'f.clarke@globalretail.com',        sentById: salesRep2.id,  sentAt: daysAgo(18), openedAt: null,       metadata: { opens: 0 } },
    { channel: 'EMAIL', direction: 'OUTBOUND', status: 'OPENED',    fromAddr: 'john@acme.com',     toAddr: 'f.clarke@globalretail.com',      subject: 'Re: Acme CRM Proposal – Quick question on delivery',                       body: 'Fiona, just wanted to confirm — did you get a chance to review the proposal? Happy to arrange a demo with your procurement team.',                                                          htmlBody: null, contactEmail: 'f.clarke@globalretail.com',        sentById: salesRep2.id,  sentAt: daysAgo(12), openedAt: daysAgo(11), metadata: { opens: 2, clicks: 1 } },
    { channel: 'EMAIL', direction: 'INBOUND',  status: 'DELIVERED',  fromAddr: 'f.clarke@globalretail.com', toAddr: 'john@acme.com',         subject: 'Re: Acme CRM Proposal – Scheduling a Demo',                               body: 'John, we\'ve reviewed the proposal. Very interested. Can we bring in our IT Director Kevin Park as well? Suggest next Tuesday at 2pm CT.',                                                   htmlBody: null, contactEmail: 'f.clarke@globalretail.com',        sentById: null,          sentAt: daysAgo(9),  openedAt: null,       metadata: { replied: true } },
    { channel: 'EMAIL', direction: 'OUTBOUND', status: 'CLICKED',   fromAddr: 'john@acme.com',     toAddr: 'f.clarke@globalretail.com',      subject: 'Demo Confirmed – Tuesday 2pm CT + Agenda',                                 body: 'Fiona, confirmed for Tuesday at 2pm CT. I\'ve sent a calendar invite with a demo agenda and the Zoom link.',                                                                                 htmlBody: null, contactEmail: 'f.clarke@globalretail.com',        sentById: salesRep2.id,  sentAt: daysAgo(8),  openedAt: daysAgo(8),  metadata: { opens: 3, clicks: 2, attachments: ['demo-agenda.pdf'] } },

    // Thread: FinServ negotiation
    { channel: 'EMAIL', direction: 'OUTBOUND', status: 'OPENED',    fromAddr: 'john@acme.com',     toAddr: 'lisa.b@finservpartners.com',     subject: 'Revised Commercial Terms – FinServ Partners',                              body: 'Lisa, as requested, I\'ve revised the commercial terms with the 10% volume discount applied and extended payment terms (Net 45). Let me know if you need further adjustments.',             htmlBody: null, contactEmail: 'lisa.b@finservpartners.com',        sentById: salesRep2.id,  sentAt: daysAgo(5),  openedAt: daysAgo(5),  metadata: { opens: 4, clicks: 3 } },
    { channel: 'EMAIL', direction: 'INBOUND',  status: 'DELIVERED',  fromAddr: 'lisa.b@finservpartners.com', toAddr: 'john@acme.com',        subject: 'Re: Revised Commercial Terms',                                             body: 'John, the revised terms look good. I need to get sign-off from our General Counsel. Can we extend the proposal validity by 7 days?',                                                       htmlBody: null, contactEmail: 'lisa.b@finservpartners.com',        sentById: null,          sentAt: daysAgo(4),  openedAt: null,       metadata: { replied: true } },
    { channel: 'EMAIL', direction: 'OUTBOUND', status: 'OPENED',    fromAddr: 'john@acme.com',     toAddr: 'lisa.b@finservpartners.com',     subject: 'Re: Proposal Validity Extended + Final Checklist',                         body: 'Lisa, happy to extend. I\'ve updated the proposal expiry to April 30th. Also attaching a "Close Checklist" so we can keep things on track.',                                                 htmlBody: null, contactEmail: 'lisa.b@finservpartners.com',        sentById: salesRep2.id,  sentAt: daysAgo(3),  openedAt: daysAgo(3),  metadata: { opens: 2, clicks: 1 } },

    // Outreach to hot uncontacted leads
    { channel: 'EMAIL', direction: 'OUTBOUND', status: 'DELIVERED',  fromAddr: 'priya@acme.com',    toAddr: 'rachel@startup.io',             subject: 'Your CRM question – Acme can help',                                        body: 'Hi Rachel, I noticed you\'ve been exploring our enterprise features. I\'d love to show you how Acme CRM can scale with your team. Are you free for a 15-min intro call this week?',           htmlBody: null, contactEmail: null,                               sentById: salesRep3.id,  sentAt: daysAgo(1),  openedAt: null,       metadata: { opens: 0, leadEmail: 'rachel@startup.io' } },

    // Nurture campaign emails
    { channel: 'EMAIL', direction: 'OUTBOUND', status: 'OPENED',    fromAddr: 'system@acme.com',   toAddr: 'daniel@mediagroup.com',          subject: '[Acme CRM] 5 Ways CRMs Accelerate Media Teams',                           body: 'Hi Daniel, we\'ve put together a guide specifically for media & entertainment companies using CRM. Including how CloudStream Media uses our platform for content ops.',                       htmlBody: null, contactEmail: null,                               sentById: adminUser.id,  sentAt: daysAgo(14), openedAt: daysAgo(14), metadata: { opens: 1, clicks: 0, campaign: 'media-nurture', leadEmail: 'daniel@mediagroup.com' } },
    { channel: 'EMAIL', direction: 'OUTBOUND', status: 'OPENED',    fromAddr: 'system@acme.com',   toAddr: 'f.muller@techhaus.de',           subject: '[Acme CRM] Wie Top-Tech-Teams ihre Sales-Pipeline optimieren',             body: 'Hallo Felix, wir haben einen deutschen Guide erstellt: "Wie DACH-Unternehmen mit modernen CRMs skalieren". Relevant für Ihr Wachstum in 2026.',                                           htmlBody: null, contactEmail: null,                               sentById: adminUser.id,  sentAt: daysAgo(14), openedAt: daysAgo(13), metadata: { opens: 3, clicks: 1, campaign: 'dach-nurture', leadEmail: 'f.muller@techhaus.de' } },

    // SMS communications
    { channel: 'SMS', direction: 'OUTBOUND', status: 'DELIVERED',   fromAddr: '+1-800-555-ACME',   toAddr: '+1-415-555-0101',               subject: null, body: 'Hi David, Sarah from Acme here. Quick reminder about our proposal review call tomorrow at 3pm ET. Reply CONFIRM or let me know if you need to reschedule.',                                           htmlBody: null, contactEmail: 'david.chen@techvision.com',       sentById: salesRep1.id,  sentAt: daysAgo(1),  openedAt: null,       metadata: {} },
    { channel: 'SMS', direction: 'INBOUND',  status: 'DELIVERED',   fromAddr: '+1-415-555-0101',   toAddr: '+1-800-555-ACME',               subject: null, body: 'Confirmed! Talk tomorrow at 3pm.',                                                                                                                                                                      htmlBody: null, contactEmail: 'david.chen@techvision.com',       sentById: null,          sentAt: daysAgo(1),  openedAt: null,       metadata: { replied: true } },
  ];

  for (const e of emailsRaw) {
    const { contactEmail, ...emailData } = e;
    const contact = contactEmail ? contacts.find(c => c.email === contactEmail) : null;
    await prisma.communication.create({
      data: {
        ...emailData,
        tenantId: tenant.id,
        contactId: contact?.id ?? null,
      } as any,
    });
  }
  console.log(`✅ Communications (emails + SMS): ${emailsRaw.length}`);

  // ─── Activities ────────────────────────────────────────────────────────────
  const activitiesRaw = [
    // TechVision activities
    { type: 'CALL',    entityType: 'CONTACT', entityEmail: 'david.chen@techvision.com',        subject: 'Discovery call – Pain points & requirements',          body: 'Discussed current CRM limitations. David mentioned they have 80 reps and need better pipeline visibility. Legacy Salesforce is costing them $300k/yr. Key concern: migration effort.',     duration: 45, createdById: salesRep1.id, createdAt: daysAgo(35) },
    { type: 'MEETING', entityType: 'CONTACT', entityEmail: 'david.chen@techvision.com',        subject: 'Product demo – Enterprise features walkthrough',        body: 'Demonstrated pipeline management, AI insights, blockchain audit trail. David and Amanda both attended. Amanda particularly liked the email automation. Action: send proposal.',             duration: 60, createdById: salesRep1.id, createdAt: daysAgo(20) },
    { type: 'EMAIL',   entityType: 'CONTACT', entityEmail: 'david.chen@techvision.com',        subject: 'Proposal sent – Enterprise License (80 seats)',         body: 'Sent enterprise proposal via email. Included volume discount and 90-day free implementation support.',                                                                                          duration: null, createdById: salesRep1.id, createdAt: daysAgo(14) },
    { type: 'NOTE',    entityType: 'COMPANY', entityEmail: null, companyName: 'TechVision Inc', subject: 'Intel from LinkedIn',                                  body: 'TechVision just posted 12 new sales rep job listings. They are scaling fast. This is the right moment to close the CRM deal. Competitor activity: Salesforce also pitched last week.',   duration: null, createdById: salesManager.id, createdAt: daysAgo(5) },

    // Global Retail activities
    { type: 'MEETING', entityType: 'CONTACT', entityEmail: 'emma.j@globalretail.com',          subject: 'Stakeholder alignment meeting',                         body: 'Met with Emma (VP Ops) and Kevin (IT Dir). Both aligned on need. Kevin raised API integration concern. Action: technical deep dive session with engineering.',                            duration: 90, createdById: salesRep2.id, createdAt: daysAgo(20) },
    { type: 'CALL',    entityType: 'CONTACT', entityEmail: 'f.clarke@globalretail.com',        subject: 'Demo prep call with Fiona',                             body: 'Pre-demo call to confirm agenda and attendees. Fiona confirmed Kevin Park, Emma Johnson, and 2 procurement analysts will join.',                                                              duration: 20, createdById: salesRep2.id, createdAt: daysAgo(9) },
    { type: 'MEETING', entityType: 'CONTACT', entityEmail: 'k.park@globalretail.com',          subject: 'Technical deep-dive – API & integrations',              body: 'Addressed Kevin\'s API concerns. Showed REST API docs and Zapier connector. Kevin is satisfied. Recommended 3-month implementation plan.',                                                        duration: 75, createdById: salesRep2.id, createdAt: daysAgo(6) },

    // FinServ activities
    { type: 'CALL',    entityType: 'CONTACT', entityEmail: 'lisa.b@finservpartners.com',       subject: 'Commercial negotiation call',                           body: 'Lisa pushed back on price. Agreed to 10% volume discount in exchange for 2-year commitment. Payment terms extended to Net 45. GC review in progress.',                                      duration: 40, createdById: salesRep2.id, createdAt: daysAgo(7) },
    { type: 'NOTE',    entityType: 'CONTACT', entityEmail: 'lisa.b@finservpartners.com',       subject: 'Budget confirmed for Q1',                              body: 'Finance confirmed $95k budget is approved. Deal is now contingent on legal review only. Probability increased to 85%.',                                                                       duration: null, createdById: salesRep2.id, createdAt: daysAgo(5) },

    // Healthcare activities
    { type: 'CALL',    entityType: 'CONTACT', entityEmail: 'j.williams@healthcareplus.com',    subject: 'Intro call – HIPAA compliance focus',                  body: 'James is primarily concerned about HIPAA compliance and data residency. Sent over our compliance whitepaper and SOC 2 Type II report.',                                                    duration: 30, createdById: salesRep1.id, createdAt: daysAgo(14) },
    { type: 'EMAIL',   entityType: 'CONTACT', entityEmail: 'n.roberts@healthcareplus.com',     subject: 'Connected with CMO – new stakeholder',                 body: 'Nina Roberts (CMO) was introduced by James as an additional stakeholder. She is interested in the marketing automation module.',                                                              duration: null, createdById: salesRep3.id, createdAt: daysAgo(5) },

    // Nexus activities
    { type: 'CALL',    entityType: 'CONTACT', entityEmail: 'c.rivera@nexuslogistics.com',      subject: 'Discovery call – Supply chain integration',             body: 'Carlos outlined requirements: route optimization tracking, driver CRM, and dispatch integration. Excellent fit for our Operations Hub. Score raised to 85.',                               duration: 50, createdById: salesRep3.id, createdAt: daysAgo(8) },
    { type: 'MEETING', entityType: 'CONTACT', entityEmail: 's.lee@nexuslogistics.com',         subject: 'Technical evaluation with Sandra Lee',                 body: 'Sandra evaluated API documentation and SDK. Positive feedback. Asked about custom field limits and webhook performance. All requirements met.',                                               duration: 45, createdById: salesRep3.id, createdAt: daysAgo(5) },

    // Stale deal — no activity for 40+ days (AI should flag)
    { type: 'CALL',    entityType: 'CONTACT', entityEmail: 'g.foster@pinnacleconstruction.com',subject: 'First contact – initial interest',                      body: 'Greg expressed interest in field CRM for 50 project managers. Sent overview deck. He mentioned budget review in Q1.',                                                                       duration: 25, createdById: salesRep2.id, createdAt: daysAgo(50) },

    // Orion Energy
    { type: 'MEETING', entityType: 'CONTACT', entityEmail: 'p.moore@orionenergy.com',          subject: 'Executive briefing – CFO & Digital Director',           body: 'Joint meeting with Patricia (VP Finance) and Derek (Digital Dir). Both engaged. Patricia cares about ROI (presented 3x ROI case study). Derek wants API-first architecture.',                duration: 60, createdById: salesRep3.id, createdAt: daysAgo(22) },

    // Won deal retrospectives (valuable AI training data)
    { type: 'NOTE',    entityType: 'CONTACT', entityEmail: 'lisa.b@finservpartners.com',       subject: 'Win retrospective – FinServ Risk Dashboard',            body: 'Key factors: (1) Reference call with Healthcare Plus, (2) 30-day POC with real data, (3) Dedicated implementation manager. Lost to Salesforce in initial evaluation but won on TCO + support.',  duration: null, createdById: salesManager.id, createdAt: daysAgo(28) },
    { type: 'NOTE',    entityType: 'CONTACT', entityEmail: 'amanda@techvision.com',            subject: 'Win retrospective – TechVision Support Contract',       body: 'Upsell from initial deal. Amanda was the internal champion. Key: monthly business reviews and proactive support resolved their top pain point within 60 days.',                                  duration: null, createdById: salesManager.id, createdAt: daysAgo(14) },
  ];

  for (const a of activitiesRaw) {
    const { entityEmail, companyName, createdAt, ...actData } = a as any;
    let entityId: string | null = null;

    if (actData.entityType === 'CONTACT' && entityEmail) {
      entityId = contacts.find(c => c.email === entityEmail)?.id ?? null;
    } else if (actData.entityType === 'COMPANY' && companyName) {
      entityId = companies.find(c => c.name === companyName)?.id ?? null;
    }

    if (entityId) {
      await prisma.activity.create({
        data: {
          ...actData,
          entityId,
          tenantId: tenant.id,
        } as any,
      });
    }
  }
  console.log(`✅ Activities: ${activitiesRaw.length}`);

  // ─── Tasks ─────────────────────────────────────────────────────────────────
  const tasksRaw = [
    // Urgent / overdue — AI should surface these
    { title: 'Send revised DPA to TechVision legal team',            status: 'TODO',        priority: 'URGENT', assigneeId: salesRep1.id,  dueDate: daysAgo(2),        description: 'David Chen requested DPA review. Legal asked 3 questions — answer and send revised doc. Deal is blocked on this.' },
    { title: 'Follow up: Pinnacle Construction — silent for 40 days',status: 'TODO',        priority: 'HIGH',   assigneeId: salesRep2.id,  dueDate: daysAgo(1),        description: 'Greg Foster went dark. Last contact was 50 days ago. Deal closing date is in 7 days. Try phone call and LinkedIn.' },
    { title: 'Prepare close checklist for FinServ deal',             status: 'IN_PROGRESS', priority: 'HIGH',   assigneeId: salesRep2.id,  dueDate: daysFromNow(1),    description: 'Close expected by April 30. GC review still pending. Prepare e-signature package and order form.' },
    { title: 'Schedule Global Retail technical demo',                status: 'TODO',        priority: 'HIGH',   assigneeId: salesRep2.id,  dueDate: daysFromNow(2),    description: 'Demo agreed with Fiona. Include Kevin Park and Emma Johnson. Use Sandbox environment with retail data.' },

    // This week
    { title: 'Send proposal to Healthcare Plus (Patient Portal)',    status: 'TODO',        priority: 'HIGH',   assigneeId: salesRep1.id,  dueDate: daysFromNow(3),    description: 'Discovery done. Send formal proposal with HIPAA addendum and SOC 2 report.' },
    { title: 'Assign hot inbound leads: Rachel Green & Jordan Wells',status: 'TODO',        priority: 'HIGH',   assigneeId: salesManager.id,dueDate: daysFromNow(1),   description: 'Two high-score (88, 92) inbound leads with no assignee. Assign to reps and trigger outreach within 24 hours.' },
    { title: 'Priya referral lead — reach out to Priya Shah',       status: 'TODO',        priority: 'MEDIUM', assigneeId: salesRep3.id,  dueDate: daysFromNow(2),    description: 'Referred by David Chen (TechVision). Looking to replace Salesforce. High intent. Contact within 24 hours.' },
    { title: 'Q1 Sales review presentation for leadership',          status: 'IN_PROGRESS', priority: 'HIGH',   assigneeId: salesManager.id,dueDate: daysFromNow(4),   description: 'Prepare Q1 deck: pipeline health, won/lost analysis, team performance, Q2 forecast.' },
    { title: 'Demo prep: Sophia Martinez (Design Co)',               status: 'TODO',        priority: 'MEDIUM', assigneeId: salesRep2.id,  dueDate: daysFromNow(5),    description: 'Sophia confirmed demo. Budget: $50k approved. Use the creative-industry template.' },
    { title: 'Negotiate renewal terms with TechVision',              status: 'TODO',        priority: 'MEDIUM', assigneeId: salesRep1.id,  dueDate: daysFromNow(7),    description: 'TechVision renewal up in 45 days. David Chen hinted they may want to expand to 120 users. Expansion opportunity.' },

    // Next 2 weeks
    { title: 'Nurture Daniel Taylor (Media Group) — Q2 re-engage',  status: 'TODO',        priority: 'MEDIUM', assigneeId: salesRep2.id,  dueDate: daysFromNow(10),   description: 'Daniel\'s budget unfreezes in Q2. Send personalised case study + new pricing with 15% Q2 promo discount.' },
    { title: 'Book Orion Energy contract review call',               status: 'TODO',        priority: 'MEDIUM', assigneeId: salesRep3.id,  dueDate: daysFromNow(10),   description: 'Patricia Moore confirmed interest in API-first. Send integration spec doc and book call.' },
    { title: 'BioCore renewal + expansion discussion',               status: 'TODO',        priority: 'HIGH',   assigneeId: salesRep1.id,  dueDate: daysFromNow(10),   description: 'Renewal closes in 10 days. BioCore pilot users love the platform — upsell from 10 to 30 users.' },
    { title: 'Send ROI calculator to Nexus Logistics',               status: 'TODO',        priority: 'MEDIUM', assigneeId: salesRep3.id,  dueDate: daysFromNow(12),   description: 'Carlos asked for data on ROI. Send the logistics-specific ROI template with their projected volumes.' },
    { title: 'Update CRM with latest prospect notes from trade show',status: 'TODO',        priority: 'LOW',    assigneeId: salesRep2.id,  dueDate: daysFromNow(14),   description: 'Multiple business cards from NRF. Log into CRM, score leads, assign follow-ups.' },

    // Completed
    { title: 'Sent FinServ Risk Dashboard contract for signature',   status: 'COMPLETED',   priority: 'URGENT', assigneeId: salesRep2.id,  dueDate: daysAgo(32),       description: 'Contract signed. Deal marked Won. $48k ARR.', completedAt: daysAgo(30) },
    { title: 'BioCore pilot kick-off call',                          status: 'COMPLETED',   priority: 'HIGH',   assigneeId: salesRep1.id,  dueDate: daysAgo(47),       description: 'Pilot successfully started. 10 users onboarded.', completedAt: daysAgo(45) },
  ];

  for (const t of tasksRaw) {
    const existing = await prisma.task.findFirst({ where: { tenantId: tenant.id, title: t.title } });
    if (!existing) {
      const { completedAt, ...taskData } = t as any;
      await prisma.task.create({
        data: {
          ...taskData,
          tenantId: tenant.id,
          createdById: adminUser.id,
          ...(completedAt && { completedAt }),
        } as any,
      });
    }
  }
  console.log(`✅ Tasks: ${tasksRaw.length}`);

  // ─── Tickets ───────────────────────────────────────────────────────────────
  const ticketsRaw = [
    { subject: 'Cannot export pipeline reports to Excel',           description: 'When clicking the "Export" button in the pipeline report view, nothing happens. Browser console shows TypeError. Reproducible on Chrome 123 and Edge.',       status: 'OPEN',        priority: 'HIGH',   contactEmail: 'david.chen@techvision.com',       assigneeId: supportAgent.id, replies: [
      { body: 'Hi David, thanks for reporting this. We reproduced the issue in Chrome 123. Our engineering team is on it — expected fix in 48 hours. Workaround: use PDF export for now.', isInternal: false, authorId: supportAgent.id },
      { body: 'Internal: This is a known Safari-related regression in the xlsx library (v3.2.1). Fix PR is open — review by EOD.', isInternal: true, authorId: adminUser.id },
    ]},
    { subject: 'API rate limit lower than plan advertises',          description: 'Our integration is hitting rate limits at ~50 req/min. Our Pro plan should allow 200 req/min. This is breaking our nightly sync.',                              status: 'IN_PROGRESS', priority: 'URGENT', contactEmail: 'k.park@globalretail.com',         assigneeId: supportAgent.id, replies: [
      { body: 'Kevin, I\'ve checked your account — you were on the legacy rate limit tier. I\'ve escalated this to our infra team and upgraded your rate limit to 500 req/min immediately. Apologies for the disruption.', isInternal: false, authorId: supportAgent.id },
    ]},
    { subject: 'Email notifications not delivered to Outlook users', description: 'Several team members using Outlook (corporate domain) are not receiving CRM notifications. Gmail users are fine.',                                              status: 'RESOLVED',    priority: 'MEDIUM', contactEmail: 'j.williams@healthcareplus.com',   assigneeId: supportAgent.id, resolvedAt: daysAgo(5), replies: [
      { body: 'The issue was caused by a DKIM misconfiguration for healthcareplus.com\'s mail server. We\'ve updated our SPF/DKIM records. Notifications should flow normally now. Please confirm!', isInternal: false, authorId: supportAgent.id },
      { body: 'Confirmed fixed! All 5 users are now receiving emails. Thank you for the quick resolution.', isInternal: false, authorId: null },
    ]},
    { subject: 'Mobile app crashes on launch (iOS 17.4)',            description: 'App crashes immediately on launch on iPhone 14 running iOS 17.4. Works fine on iOS 16. This is blocking our field team of 12 reps.',                           status: 'OPEN',        priority: 'URGENT', contactEmail: 'c.rivera@nexuslogistics.com',     assigneeId: null, replies: [] },
    { subject: 'Custom field not appearing in deal export',          description: 'We created a custom field called "Competitor" on Deal records but it doesn\'t show up in the CSV export. Other custom fields export fine.',                    status: 'OPEN',        priority: 'MEDIUM', contactEmail: 'a.reyes@vertexanalytics.io',      assigneeId: supportAgent.id, replies: [
      { body: 'Angela, this is a bug in the export mapper — it only includes the first 10 custom fields. Yours is #11. Workaround: reorder your custom fields to put "Competitor" in the top 10. Fix coming in the next release (v2.8.1).', isInternal: false, authorId: supportAgent.id },
    ]},
    { subject: 'Pipeline automation rule not triggering',            description: 'We set up an automation to send a follow-up email when a deal enters Negotiation stage, but the email is never sent.',                                         status: 'IN_PROGRESS', priority: 'HIGH',   contactEmail: 'lisa.b@finservpartners.com',      assigneeId: supportAgent.id, replies: [
      { body: 'Lisa, we\'ve identified the issue — automation rules with stage triggers require the "Advanced Automation" add-on which isn\'t on your current plan. Escalating to your account manager John Doe to discuss options.', isInternal: false, authorId: supportAgent.id },
    ]},
  ];

  for (const t of ticketsRaw) {
    const { contactEmail, replies, resolvedAt, ...ticketData } = t as any;
    const contact = contacts.find(c => c.email === contactEmail);
    const existing = await prisma.ticket.findFirst({ where: { tenantId: tenant.id, subject: ticketData.subject } });
    if (!existing) {
      const ticket = await prisma.ticket.create({
        data: {
          ...ticketData,
          tenantId: tenant.id,
          contactId: contact?.id ?? null,
          createdById: adminUser.id,
          ...(resolvedAt && { resolvedAt }),
        } as any,
      });

      for (const r of replies) {
        await prisma.ticketReply.create({
          data: {
            ticketId: ticket.id,
            tenantId: tenant.id,
            body: r.body,
            isInternal: r.isInternal,
            authorId: r.authorId ?? null,
          },
        });
      }
    }
  }
  console.log(`✅ Tickets: ${ticketsRaw.length} with replies`);

  // ─── Email Templates ───────────────────────────────────────────────────────
  const templatesData = [
    { name: 'Welcome Email',           subject: 'Welcome to Acme CRM, {{firstName}}!',                  htmlBody: '<html><body><h1>Welcome, {{firstName}}!</h1><p>Your account is ready. <a href="{{loginUrl}}">Login here</a>.</p></body></html>',                                                                                                  variables: ['firstName', 'loginUrl'],                                    category: 'onboarding',     isActive: true },
    { name: 'Lead Follow-Up (Day 1)',  subject: 'Quick question about your {{painPoint}}, {{firstName}}',htmlBody: '<html><body><p>Hi {{firstName}},</p><p>I saw you explored our platform and wanted to reach out personally. Many {{industry}} companies use Acme to solve {{painPoint}}. Happy to do a 15-min call?</p><p>{{senderName}}</p></body></html>', variables: ['firstName', 'painPoint', 'industry', 'senderName'],        category: 'sales',          isActive: true },
    { name: 'Lead Follow-Up (Day 5)',  subject: 'Still thinking it over, {{firstName}}?',                htmlBody: '<html><body><p>Hi {{firstName}}, just following up. I know evaluating CRMs is a big decision. Happy to share a case study from {{industry}} or answer any specific questions.</p></body></html>',                                        variables: ['firstName', 'industry'],                                    category: 'sales',          isActive: true },
    { name: 'Proposal Email',          subject: 'Your Acme CRM Proposal – {{companyName}}',              htmlBody: '<html><body><p>Hi {{firstName}},</p><p>As discussed, please find your tailored proposal attached. Key highlights: {{highlights}}.</p><p>Valid until {{expiryDate}}. Let\'s review it together?</p></body></html>',                   variables: ['firstName', 'companyName', 'highlights', 'expiryDate'],    category: 'sales',          isActive: true },
    { name: 'Demo Confirmation',       subject: 'Demo Confirmed: {{date}} at {{time}} – Agenda Inside',  htmlBody: '<html><body><h2>See you {{date}}!</h2><p>Here\'s what we\'ll cover: {{agenda}}</p><p>Zoom: {{zoomLink}}</p></body></html>',                                                                                                           variables: ['date', 'time', 'agenda', 'zoomLink'],                      category: 'sales',          isActive: true },
    { name: 'Deal Won – Internal',     subject: '🎉 Deal Closed: {{dealTitle}} – ${{dealValue}}',        htmlBody: '<html><body><h2>Deal Won!</h2><p><b>Rep:</b> {{repName}}</p><p><b>Account:</b> {{clientName}}</p><p><b>Value:</b> ${{dealValue}}</p><p><b>Closed:</b> {{closedDate}}</p></body></html>',                                              variables: ['dealTitle', 'repName', 'clientName', 'dealValue', 'closedDate'], category: 'notifications', isActive: true },
    { name: 'Renewal Reminder',        subject: 'Your Acme CRM subscription renews in {{daysLeft}} days',htmlBody: '<html><body><p>Hi {{firstName}},</p><p>Your {{plan}} subscription renews on {{renewalDate}}. Ready to continue? We\'ve also prepared an upgrade option: {{upgradeOffer}}.</p></body></html>',                                        variables: ['firstName', 'plan', 'renewalDate', 'daysLeft', 'upgradeOffer'], category: 'retention',     isActive: true },
    { name: 'Re-engagement Campaign',  subject: 'We miss you, {{firstName}} – here\'s what\'s new',      htmlBody: '<html><body><p>Hi {{firstName}},</p><p>It\'s been a while. Since we last spoke, we\'ve launched {{features}}. Given your interest in {{painPoint}}, thought you\'d want to know.</p></body></html>',                                  variables: ['firstName', 'features', 'painPoint'],                       category: 'nurture',        isActive: true },
  ];

  for (const t of templatesData) {
    const existing = await prisma.emailTemplate.findFirst({ where: { tenantId: tenant.id, name: t.name } });
    if (!existing) {
      await prisma.emailTemplate.create({
        data: { ...t, tenantId: tenant.id, createdById: adminUser.id },
      });
    }
  }
  console.log(`✅ Email Templates: ${templatesData.length}`);

  // ─── Notifications ─────────────────────────────────────────────────────────
  await prisma.notification.createMany({
    skipDuplicates: true,
    data: [
      { tenantId: tenant.id, userId: salesManager.id,  title: '🔥 3 Hot Leads Unassigned',                body: 'Rachel Green (score 88), Jordan Wells (score 92), Priya Shah (score 85) have no rep assigned. Assign now to respond within the 1-hour SLA.', type: 'ai_recommendation', isRead: false },
      { tenantId: tenant.id, userId: salesRep2.id,     title: '⚠️ Deal at Risk: Pinnacle Construction',  body: 'No activity in 50 days. Closing date is in 7 days. AI recommends immediate outreach.', type: 'deal_alert', isRead: false },
      { tenantId: tenant.id, userId: salesRep1.id,     title: '📅 Closing Soon: TechVision Enterprise',  body: 'Deal closing in 15 days. Last email opened 4 days ago. Next action: schedule proposal review call.', type: 'deal_alert', isRead: false },
      { tenantId: tenant.id, userId: salesRep2.id,     title: '📧 FinServ Email Opened 4x',              body: 'Lisa Brown opened your commercial terms email 4 times. High buying signal. Recommended action: call now.', type: 'ai_recommendation', isRead: false },
      { tenantId: tenant.id, userId: salesRep1.id,     title: '🆕 Lead Assigned: Rachel Green',           body: 'Rachel Green (Startup.io, score 88) has been assigned to you. Contact within 24 hours.', type: 'lead_assigned', isRead: false },
      { tenantId: tenant.id, userId: salesRep2.id,     title: '✅ Deal Moved to Closed Won',              body: 'FinServ Risk Dashboard ($48,000) — congratulations! Moved to Closed Won.', type: 'deal_updated', isRead: true, readAt: daysAgo(30) },
      { tenantId: tenant.id, userId: supportAgent.id,  title: '🆕 Urgent Ticket: Nexus iOS Crash',       body: 'Nexus Logistics (Carlos Rivera) — mobile app crashing on iOS 17.4. Blocking 12 field reps. Priority: URGENT.', type: 'ticket_assigned', isRead: false },
      { tenantId: tenant.id, userId: salesManager.id,  title: '📊 Q1 Pipeline: $623k open value',        body: 'Open pipeline value is $623k across 19 active deals. Top 3 at-risk deals need attention. AI report ready.', type: 'pipeline_report', isRead: false },
      { tenantId: tenant.id, userId: salesRep3.id,     title: '📈 Lead Score Increased: Felix Müller',   body: 'Felix Müller (TechHaus GmbH) opened 3 nurture emails. Score increased from 55 to 68. Recommend direct outreach.', type: 'ai_recommendation', isRead: false },
      { tenantId: tenant.id, userId: salesRep1.id,     title: '⏰ Overdue Task: Send DPA to TechVision',  body: 'Task was due 2 days ago. TechVision deal is blocked on legal review. Mark urgent.', type: 'task_overdue', isRead: false },
    ],
  });
  console.log(`✅ Notifications: 10`);

  // ─── Billing Info ──────────────────────────────────────────────────────────
  const existingBilling = await prisma.billingInfo.findUnique({ where: { tenantId: tenant.id } });
  if (!existingBilling) {
    await prisma.billingInfo.create({
      data: {
        tenantId: tenant.id,
        plan: 'PRO',
        status: 'ACTIVE',
        currentPeriodEnd: daysFromNow(30),
      },
    });
  }
  console.log(`✅ Billing info created`);

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Demo Credentials:');
  console.log('   Admin:            admin@acme.com     / Password123!');
  console.log('   Sales Manager:    manager@acme.com   / Password123!');
  console.log('   Sales Rep (Sarah):sarah@acme.com     / Password123!');
  console.log('   Sales Rep (John): john@acme.com      / Password123!');
  console.log('   Sales Rep (Priya):priya@acme.com     / Password123!');
  console.log('   Support:          support@acme.com   / Password123!');
  console.log('\n🤖 AI Copilot Demo Highlights:');
  console.log('   • 3 hot unassigned leads (scores 85-92) → recommend assignment');
  console.log('   • Pinnacle Construction deal: 50 days no activity, closing in 7 days');
  console.log('   • TechVision $150k deal: proposal sent, no reply in 4 days');
  console.log('   • FinServ email opened 4x → high buying signal, call recommended');
  console.log('   • Global Retail Inventory: closing in 10 days, in Proposal stage');
  console.log('   • BioCore renewal: closing in 10 days + expansion opportunity');
  console.log('   • Felix Müller: 80% email open rate → re-engagement recommended');
  console.log('   • $623k open pipeline across 19 deals in 2 pipelines');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
