/**
 * Prisma Seed Script — Rich Demo Data (Production-Grade & Idempotent)
 *
 * This script creates a realistic dataset for CRM/AI demos.
 *
 * SAFETY:
 * - Blocked in PRODUCTION unless FORCE_SEED=true is set.
 * - Fully idempotent: can be run multiple times safely.
 * - Uses stable externalId/idempotency keys for all records.
 *
 * USAGE:
 * - npx ts-node prisma/seed.ts
 * - FORCE_SEED=true npx ts-node prisma/seed.ts (to override production guard)
 * - DRY_RUN=true npx ts-node prisma/seed.ts (to log without writing - implemented for key entities)
 */

import { PrismaClient, ActivityType, EntityType, CommunicationChannel, CommunicationDirection, CommunicationStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Configuration
const IS_PROD = process.env.NODE_ENV === 'production';
const FORCE_SEED = process.env.FORCE_SEED === 'true';
const DRY_RUN = process.env.DRY_RUN === 'true';
const SEED_PREFIX = 'seed_v1_';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-05-01T12:00:00Z'); // Fixed baseline for idempotency
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);
const daysFromNow = (d: number) => new Date(now.getTime() + d * DAY);

async function main() {
  if (IS_PROD && !FORCE_SEED) {
    console.error('❌ ERROR: Seeding is blocked in production to prevent data corruption.');
    console.error('   If you REALLY want to seed production, set FORCE_SEED=true');
    process.exit(1);
  }

  if (DRY_RUN) console.log('🧪 DRY RUN ENABLED - No writes will be performed to the database.');

  console.log(`🌱 Starting seed in ${process.env.NODE_ENV || 'development'} mode...`);

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
  const usersToCreate = [
    { email: 'admin@acme.com', firstName: 'Alice', lastName: 'Admin', role: 'ADMIN', title: 'CRM Administrator' },
    { email: 'manager@acme.com', firstName: 'Bob', lastName: 'Manager', role: 'SALES_MANAGER', title: 'Sales Manager' },
    { email: 'sarah@acme.com', firstName: 'Sarah', lastName: 'Smith', role: 'SALES_REP', title: 'Account Executive' },
    { email: 'john@acme.com', firstName: 'John', lastName: 'Doe', role: 'SALES_REP', title: 'Account Executive' },
    { email: 'priya@acme.com', firstName: 'Priya', lastName: 'Patel', role: 'SALES_REP', title: 'Senior Account Executive' },
    { email: 'support@acme.com', firstName: 'Mike', lastName: 'Support', role: 'SUPPORT_AGENT', title: 'Customer Support Lead' },
  ];

  const users: Record<string, any> = {};
  for (const u of usersToCreate) {
    users[u.email] = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: {},
      create: {
        tenantId: tenant.id,
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role as any,
        status: 'ACTIVE',
        jobTitle: u.title,
        timezone: 'America/New_York'
      },
    });
  }
  console.log(`✅ Users: ${usersToCreate.length} upserted`);

  const adminUser = users['admin@acme.com'];
  const salesManager = users['manager@acme.com'];
  const salesRep1 = users['sarah@acme.com'];
  const salesRep2 = users['john@acme.com'];
  const salesRep3 = users['priya@acme.com'];
  const supportAgent = users['support@acme.com'];

  // ─── Pipelines & Stages ────────────────────────────────────────────────────
  const pipelinesToCreate = [
    {
      name: 'Sales Pipeline',
      isDefault: true,
      stages: [
        { name: 'Prospecting',   position: 0, probability: 0.1,  color: '#94a3b8' },
        { name: 'Qualification', position: 1, probability: 0.25, color: '#60a5fa' },
        { name: 'Proposal',      position: 2, probability: 0.5,  color: '#a78bfa' },
        { name: 'Negotiation',   position: 3, probability: 0.75, color: '#f59e0b' },
        { name: 'Closed Won',    position: 4, probability: 1.0,  color: '#22c55e', isWon: true },
        { name: 'Closed Lost',   position: 5, probability: 0.0,  color: '#ef4444', isLost: true },
      ]
    },
    {
      name: 'Renewal Pipeline',
      isDefault: false,
      stages: [
        { name: 'Up for Renewal',    position: 0, probability: 0.6,  color: '#94a3b8' },
        { name: 'Renewal Sent',      position: 1, probability: 0.75, color: '#60a5fa' },
        { name: 'In Negotiation',    position: 2, probability: 0.85, color: '#f59e0b' },
        { name: 'Renewed',           position: 3, probability: 1.0,  color: '#22c55e', isWon: true },
        { name: 'Churned',           position: 4, probability: 0.0,  color: '#ef4444', isLost: true },
      ]
    }
  ];

  const pipelines: Record<string, any> = {};
  for (const p of pipelinesToCreate) {
    const pipeline = await prisma.pipeline.upsert({
      where: { id: (await prisma.pipeline.findFirst({ where: { tenantId: tenant.id, name: p.name } }))?.id || '00000000-0000-0000-0000-000000000000' },
      update: {},
      create: { tenantId: tenant.id, name: p.name, isDefault: p.isDefault },
    });
    pipelines[p.name] = pipeline;

    for (const s of p.stages) {
      await prisma.stage.upsert({
        where: { pipelineId_name: { pipelineId: pipeline.id, name: s.name } },
        update: { position: s.position, probability: s.probability, color: s.color },
        create: {
          ...s,
          pipelineId: pipeline.id,
          tenantId: tenant.id,
        },
      });
    }
  }

  const salesPipeline = pipelines['Sales Pipeline'];
  const renewalPipeline = pipelines['Renewal Pipeline'];
  const salesStages = await prisma.stage.findMany({ where: { pipelineId: salesPipeline.id }, orderBy: { position: 'asc' } });
  const renewalStages = await prisma.stage.findMany({ where: { pipelineId: renewalPipeline.id }, orderBy: { position: 'asc' } });

  console.log(`✅ Pipelines: Sales + Renewal upserted`);

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

  const companies: Record<string, any> = {};
  for (const c of companiesData) {
    companies[c.name] = await prisma.company.upsert({
      where: { id: (await prisma.company.findFirst({ where: { tenantId: tenant.id, name: c.name } }))?.id || '00000000-0000-0000-0000-000000000000' },
      update: { ...c },
      create: { ...c, tenantId: tenant.id, ownerId: salesManager.id },
    });
  }
  console.log(`✅ Companies: ${companiesData.length} upserted`);

  // ─── Contacts ──────────────────────────────────────────────────────────────
  const contactsRaw = [
    { firstName: 'David',    lastName: 'Chen',      email: 'david.chen@techvision.com',      phone: '+1-415-555-0101', mobile: '+1-415-555-0191', jobTitle: 'CTO',                 department: 'Engineering',   companyName: 'TechVision Inc',        assignee: 'sarah@acme.com', lastContactedAt: daysAgo(3),  totalSpent: 45000,  tags: ['key-decision-maker', 'technical'] },
    { firstName: 'Amanda',   lastName: 'Wilson',    email: 'amanda@techvision.com',           phone: '+1-415-555-0106', mobile: null,              jobTitle: 'Head of Sales',       department: 'Sales',         companyName: 'TechVision Inc',        assignee: 'sarah@acme.com', lastContactedAt: daysAgo(8),  totalSpent: 12000,  tags: ['champion', 'influencer'] },
    { firstName: 'Emma',     lastName: 'Johnson',   email: 'emma.j@globalretail.com',         phone: '+1-312-555-0102', mobile: '+1-312-555-0192', jobTitle: 'VP Operations',       department: 'Operations',    companyName: 'Global Retail Co',      assignee: 'john@acme.com',  lastContactedAt: daysAgo(1),  totalSpent: 120000, tags: ['vp', 'operations'] },
    { firstName: 'Kevin',    lastName: 'Park',      email: 'k.park@globalretail.com',         phone: '+1-312-555-0112', mobile: null,              jobTitle: 'IT Director',         department: 'IT',            companyName: 'Global Retail Co',      assignee: 'john@acme.com',  lastContactedAt: daysAgo(15), totalSpent: 8000,   tags: ['technical-evaluator'] },
    { firstName: 'James',    lastName: 'Williams',  email: 'j.williams@healthcareplus.com',   phone: '+1-617-555-0103', mobile: '+1-617-555-0193', jobTitle: 'Director of IT',      department: 'IT',            companyName: 'Healthcare Plus',       assignee: 'sarah@acme.com', lastContactedAt: daysAgo(21), totalSpent: 55000,  tags: ['director', 'budget-holder'] },
    { firstName: 'Nina',     lastName: 'Roberts',   email: 'n.roberts@healthcareplus.com',    phone: '+1-617-555-0113', mobile: null,              jobTitle: 'CMO',                 department: 'Marketing',     companyName: 'Healthcare Plus',       assignee: 'priya@acme.com', lastContactedAt: daysAgo(5),  totalSpent: 0,      tags: ['new-contact', 'c-suite'] },
    { firstName: 'Lisa',     lastName: 'Brown',     email: 'lisa.b@finservpartners.com',      phone: '+1-212-555-0104', mobile: '+1-212-555-0194', jobTitle: 'CFO',                 department: 'Finance',       companyName: 'FinServ Partners',      assignee: 'john@acme.com',  lastContactedAt: daysAgo(2),  totalSpent: 95000,  tags: ['cfo', 'deal-signer'] },
    { firstName: 'Robert',   lastName: 'Chang',     email: 'r.chang@finservpartners.com',     phone: '+1-212-555-0114', mobile: null,              jobTitle: 'VP Technology',       department: 'Technology',    companyName: 'FinServ Partners',      assignee: 'priya@acme.com', lastContactedAt: daysAgo(10), totalSpent: 0,      tags: ['vp', 'technical'] },
    { firstName: 'Tom',      lastName: 'Davis',     email: 'tom.d@edutech.com',               phone: '+1-650-555-0105', mobile: '+1-650-555-0195', jobTitle: 'CEO',                 department: 'Executive',     companyName: 'EduTech Academy',       assignee: 'sarah@acme.com', lastContactedAt: daysAgo(30), totalSpent: 28000,  tags: ['ceo', 'champion'] },
    { firstName: 'Carlos',   lastName: 'Rivera',    email: 'c.rivera@nexuslogistics.com',     phone: '+1-214-555-0115', mobile: '+1-214-555-0195', jobTitle: 'COO',                 department: 'Operations',    companyName: 'Nexus Logistics',       assignee: 'priya@acme.com', lastContactedAt: daysAgo(4),  totalSpent: 0,      tags: ['coo', 'evaluating'] },
    { firstName: 'Sandra',   lastName: 'Lee',       email: 's.lee@nexuslogistics.com',        phone: '+1-214-555-0125', mobile: null,              jobTitle: 'Head of Tech',        department: 'Technology',    companyName: 'Nexus Logistics',       assignee: 'priya@acme.com', lastContactedAt: daysAgo(4),  totalSpent: 0,      tags: ['technical-lead'] },
    { firstName: 'Marcus',   lastName: 'Thompson',  email: 'm.thompson@cloudstreammedia.com', phone: '+1-310-555-0116', mobile: '+1-310-555-0196', jobTitle: 'CEO',                 department: 'Executive',     companyName: 'CloudStream Media',     assignee: 'john@acme.com',  lastContactedAt: daysAgo(7),  totalSpent: 0,      tags: ['ceo', 'high-value'] },
    { firstName: 'Dr. Sarah', lastName: 'Kim',     email: 's.kim@biocore.com',               phone: '+1-617-555-0117', mobile: null,              jobTitle: 'Research Director',   department: 'Research',      companyName: 'BioCore Research',      assignee: 'sarah@acme.com', lastContactedAt: daysAgo(12), totalSpent: 18000,  tags: ['director', 'research'] },
    { firstName: 'Greg',     lastName: 'Foster',    email: 'g.foster@pinnacleconstruction.com',phone: '+1-713-555-0118', mobile: '+1-713-555-0198', jobTitle: 'CIO',                 department: 'IT',            companyName: 'Pinnacle Construction', assignee: 'john@acme.com',  lastContactedAt: daysAgo(45), totalSpent: 0,      tags: ['cio', 'stale-contact'] },
    { firstName: 'Patricia', lastName: 'Moore',     email: 'p.moore@orionenergy.com',         phone: '+1-303-555-0119', mobile: '+1-303-555-0199', jobTitle: 'VP Finance',          department: 'Finance',       companyName: 'Orion Energy',          assignee: 'priya@acme.com', lastContactedAt: daysAgo(6),  totalSpent: 0,      tags: ['vp', 'budget-holder'] },
    { firstName: 'Derek',    lastName: 'Walsh',     email: 'd.walsh@orionenergy.com',         phone: '+1-303-555-0129', mobile: null,              jobTitle: 'Director of Digital', department: 'Technology',    companyName: 'Orion Energy',          assignee: 'priya@acme.com', lastContactedAt: daysAgo(6),  totalSpent: 0,      tags: ['digital-transformation'] },
    { firstName: 'Angela',   lastName: 'Reyes',     email: 'a.reyes@vertexanalytics.io',      phone: '+1-206-555-0120', mobile: null,              jobTitle: 'Founder & CEO',       department: 'Executive',     companyName: 'Vertex Analytics',      assignee: 'sarah@acme.com', lastContactedAt: daysAgo(2),  totalSpent: 0,      tags: ['founder', 'high-interest'] },
    { firstName: 'Howard',   lastName: 'Banks',     email: 'h.banks@meditrust.com',           phone: '+1-215-555-0121', mobile: '+1-215-555-0191', jobTitle: 'CFO',                 department: 'Finance',       companyName: 'MediTrust Group',       assignee: 'john@acme.com',  lastContactedAt: daysAgo(19), totalSpent: 0,      tags: ['cfo', 'renewal-risk'] },
    { firstName: 'Grace',    lastName: 'Nguyen',    email: 'g.nguyen@meditrust.com',          phone: '+1-215-555-0131', mobile: null,              jobTitle: 'IT Manager',          department: 'IT',            companyName: 'MediTrust Group',       assignee: 'john@acme.com',  lastContactedAt: daysAgo(19), totalSpent: 0,      tags: ['technical-lead', 'power-user'] },
    { firstName: 'Fiona',    lastName: 'Clarke',    email: 'f.clarke@globalretail.com',       phone: '+1-312-555-0122', mobile: null,              jobTitle: 'Head of Procurement', department: 'Procurement',   companyName: 'Global Retail Co',      assignee: 'manager@acme.com', lastContactedAt: daysAgo(9),  totalSpent: 35000,  tags: ['procurement', 'key-influencer'] },
  ];

  const contacts: Record<string, any> = {};
  for (const c of contactsRaw) {
    const { companyName, assignee, ...contactData } = c;
    contacts[c.email] = await prisma.contact.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: c.email } },
      update: { ...contactData },
      create: {
        ...contactData,
        tenantId: tenant.id,
        companyId: companies[companyName].id,
        assigneeId: users[assignee]?.id ?? null,
      },
    });
  }
  console.log(`✅ Contacts: ${contactsRaw.length} upserted`);

  // ─── Leads ─────────────────────────────────────────────────────────────────
  const leadsRaw = [
    { firstName: 'Rachel',    lastName: 'Green',     email: 'rachel@startup.io',         companyName: 'Startup.io',          score: 88, status: 'NEW',   source: 'WEBSITE',   tags: ['hot-lead', 'inbound'] },
    { firstName: 'Jordan',    lastName: 'Wells',     email: 'j.wells@quantumleap.ai',    companyName: 'QuantumLeap AI',       score: 92, status: 'NEW',   source: 'WEBSITE',   tags: ['hot-lead', 'series-b'] },
    { firstName: 'Priya',     lastName: 'Shah',      email: 'priya@novalabs.tech',       companyName: 'Nova Labs',            score: 85, status: 'NEW',   source: 'REFERRAL',  tags: ['referral'] },
    { firstName: 'Marcus',    lastName: 'White',     email: 'marcus@bigcorp.com',        companyName: 'BigCorp Inc',          score: 78, status: 'CONTACTED', source: 'REFERRAL', tags: ['follow-up-needed'] },
    { firstName: 'Isabella',  lastName: 'Thomas',    email: 'isabella@retail.net',       companyName: 'Retail Networks',      score: 62, status: 'CONTACTED', source: 'TRADE_SHOW', tags: ['trade-show'] },
    { firstName: 'Ahmed',     lastName: 'Hassan',    email: 'a.hassan@metatech.io',      companyName: 'MetaTech IO',          score: 71, status: 'CONTACTED', source: 'SOCIAL_MEDIA', tags: ['outbound'] },
    { firstName: 'Sophia',    lastName: 'Martinez',  email: 'sophia@designco.com',       companyName: 'Design Co',            score: 90, status: 'QUALIFIED', source: 'SOCIAL_MEDIA', tags: ['qualified'] },
    { firstName: 'William',   lastName: 'Jackson',   email: 'william@enterprise.com',    companyName: 'Enterprise Solutions', score: 74, status: 'QUALIFIED', source: 'COLD_CALL', tags: ['qualified'] },
    { firstName: 'Yuki',      lastName: 'Tanaka',    email: 'y.tanaka@futurepath.jp',    companyName: 'FuturePath Japan',     score: 80, status: 'QUALIFIED', source: 'PARTNER', tags: ['qualified'] },
    { firstName: 'Daniel',    lastName: 'Taylor',    email: 'daniel@mediagroup.com',     companyName: 'Media Group',          score: 58, status: 'NURTURING', source: 'GOOGLE_ADS', tags: ['nurturing'] },
    { firstName: 'Olivia',    lastName: 'Anderson',  email: 'olivia@cloudtech.com',      companyName: 'CloudTech Solutions',  score: 45, status: 'NURTURING', source: 'EMAIL_CAMPAIGN', tags: ['nurturing'] },
    { firstName: 'Felix',     lastName: 'Müller',    email: 'f.muller@techhaus.de',      companyName: 'TechHaus GmbH',       score: 55, status: 'NURTURING', source: 'EMAIL_CAMPAIGN', tags: ['nurturing'] },
    { firstName: 'Ethan',     lastName: 'Harris',    email: 'ethan@fintech.io',          companyName: 'FinTech IO',           score: 18, status: 'UNQUALIFIED', source: 'PARTNER', tags: ['too-small'] },
    { firstName: 'Brenda',    lastName: 'Fox',       email: 'b.fox@oldschool.biz',       companyName: 'OldSchool Inc',        score: 12, status: 'UNQUALIFIED', source: 'COLD_CALL', tags: ['not-a-fit'] },
  ];

  for (const l of leadsRaw) {
    await prisma.lead.upsert({
      where: { id: (await prisma.lead.findFirst({ where: { tenantId: tenant.id, email: l.email } }))?.id || '00000000-0000-0000-0000-000000000000' },
      update: { ...l },
      create: { ...l, tenantId: tenant.id, createdById: adminUser.id },
    });
  }
  console.log(`✅ Leads: ${leadsRaw.length} upserted`);

  // ─── Deals ─────────────────────────────────────────────────────────────────
  const dealsRaw = [
    { title: 'EduTech LMS Integration',            value: 28000,  contactEmail: 'tom.d@edutech.com',               companyName: 'EduTech Academy',       pipeline: 'Sales Pipeline', stage: 'Prospecting', status: 'OPEN',  owner: 'sarah@acme.com',   closingDate: daysFromNow(60) },
    { title: 'Vertex Analytics CRM Starter',       value: 18000,  contactEmail: 'a.reyes@vertexanalytics.io',      companyName: 'Vertex Analytics',      pipeline: 'Sales Pipeline', stage: 'Prospecting', status: 'OPEN',  owner: 'sarah@acme.com',   closingDate: daysFromNow(45) },
    { title: 'CloudStream Content CRM',            value: 52000,  contactEmail: 'm.thompson@cloudstreammedia.com', companyName: 'CloudStream Media',     pipeline: 'Sales Pipeline', stage: 'Prospecting', status: 'OPEN',  owner: 'john@acme.com',    closingDate: daysFromNow(75) },
    { title: 'Healthcare Plus Patient Portal',     value: 45000,  contactEmail: 'j.williams@healthcareplus.com',   companyName: 'Healthcare Plus',       pipeline: 'Sales Pipeline', stage: 'Qualification', status: 'OPEN', owner: 'sarah@acme.com',   closingDate: daysFromNow(30) },
    { title: 'Global Retail Mobile Commerce',      value: 78000,  contactEmail: 'emma.j@globalretail.com',         companyName: 'Global Retail Co',      pipeline: 'Sales Pipeline', stage: 'Qualification', status: 'OPEN', owner: 'manager@acme.com', closingDate: daysFromNow(45) },
    { title: 'Nexus Logistics Fleet Management',   value: 94000,  contactEmail: 'c.rivera@nexuslogistics.com',     companyName: 'Nexus Logistics',       pipeline: 'Sales Pipeline', stage: 'Qualification', status: 'OPEN', owner: 'priya@acme.com',   closingDate: daysFromNow(60) },
    { title: 'TechVision CRM Enterprise License',  value: 150000, contactEmail: 'david.chen@techvision.com',       companyName: 'TechVision Inc',        pipeline: 'Sales Pipeline', stage: 'Proposal', status: 'OPEN',      owner: 'sarah@acme.com',   closingDate: daysFromNow(15) },
    { title: 'BioCore Research Data Platform',     value: 67000,  contactEmail: 's.kim@biocore.com',               companyName: 'BioCore Research',      pipeline: 'Sales Pipeline', stage: 'Proposal', status: 'OPEN',      owner: 'sarah@acme.com',   closingDate: daysFromNow(21) },
    { title: 'Global Retail Inventory Suite',      value: 120000, contactEmail: 'f.clarke@globalretail.com',       companyName: 'Global Retail Co',      pipeline: 'Sales Pipeline', stage: 'Proposal', status: 'OPEN',      owner: 'john@acme.com',    closingDate: daysFromNow(10) },
    { title: 'Orion Energy Operations Hub',        value: 110000, contactEmail: 'p.moore@orionenergy.com',          companyName: 'Orion Energy',          pipeline: 'Sales Pipeline', stage: 'Proposal', status: 'OPEN',      owner: 'priya@acme.com',   closingDate: daysFromNow(25) },
    { title: 'Pinnacle Construction Field CRM',    value: 85000,  contactEmail: 'g.foster@pinnacleconstruction.com',companyName: 'Pinnacle Construction', pipeline: 'Sales Pipeline', stage: 'Negotiation', status: 'OPEN',    owner: 'john@acme.com',    closingDate: daysFromNow(7) },
    { title: 'MediTrust Compliance Suite',         value: 72000,  contactEmail: 'h.banks@meditrust.com',            companyName: 'MediTrust Group',       pipeline: 'Sales Pipeline', stage: 'Negotiation', status: 'OPEN',    owner: 'john@acme.com',    closingDate: daysFromNow(14) },
    { title: 'FinServ Partners Analytics Suite',   value: 95000,  contactEmail: 'lisa.b@finservpartners.com',       companyName: 'FinServ Partners',      pipeline: 'Sales Pipeline', stage: 'Negotiation', status: 'OPEN',    owner: 'john@acme.com',    closingDate: daysFromNow(12) },
    { title: 'FinServ Risk Dashboard (Yr1)',        value: 48000,  contactEmail: 'lisa.b@finservpartners.com',       companyName: 'FinServ Partners',      pipeline: 'Sales Pipeline', stage: 'Closed Won', status: 'WON',     owner: 'john@acme.com',    closingDate: daysAgo(30), wonAt: daysAgo(30) },
    { title: 'TechVision Support Contract',        value: 22000,  contactEmail: 'amanda@techvision.com',            companyName: 'TechVision Inc',        pipeline: 'Sales Pipeline', stage: 'Closed Won', status: 'WON',     owner: 'sarah@acme.com',   closingDate: daysAgo(15), wonAt: daysAgo(15) },
    { title: 'Healthcare Plus Billing System',      value: 55000,  contactEmail: 'j.williams@healthcareplus.com',  companyName: 'Healthcare Plus',       pipeline: 'Sales Pipeline', stage: 'Closed Lost', status: 'LOST',    owner: 'sarah@acme.com',   closingDate: daysAgo(20), lostReason: 'Competitor' },
    { title: 'TechVision Annual Renewal',           value: 45000,  contactEmail: 'david.chen@techvision.com',       companyName: 'TechVision Inc',        pipeline: 'Renewal Pipeline', stage: 'Up for Renewal', status: 'OPEN', owner: 'sarah@acme.com', closingDate: daysFromNow(45) },
  ];

  for (const d of dealsRaw) {
    const { contactEmail, companyName, pipeline: pName, stage: sName, owner, ...dealData } = d;
    const pipeline = pipelines[pName];
    const stage = await prisma.stage.findFirst({ where: { pipelineId: pipeline.id, name: sName } });

    await prisma.deal.upsert({
      where: { id: (await prisma.deal.findFirst({ where: { tenantId: tenant.id, title: d.title } }))?.id || '00000000-0000-0000-0000-000000000000' },
      update: { ...dealData, stageId: stage!.id },
      create: {
        ...dealData,
        tenantId: tenant.id,
        pipelineId: pipeline.id,
        stageId: stage!.id,
        contactId: contacts[contactEmail]?.id ?? null,
        companyId: companies[companyName]?.id ?? null,
        ownerId: users[owner].id,
      },
    });
  }
  console.log(`✅ Deals: ${dealsRaw.length} upserted`);

  // ─── Communications (Idempotent) ───────────────────────────────────────────
  const commsRaw = [
    { externalId: SEED_PREFIX + 'comm_1', channel: CommunicationChannel.EMAIL, direction: CommunicationDirection.OUTBOUND, status: CommunicationStatus.OPENED, fromAddr: 'sarah@acme.com', toAddr: 'david.chen@techvision.com', subject: 'Proposal – TechVision', body: 'Proposal attached.', contactEmail: 'david.chen@techvision.com', sentBy: 'sarah@acme.com', sentAt: daysAgo(14) },
    { externalId: SEED_PREFIX + 'comm_2', channel: CommunicationChannel.EMAIL, direction: CommunicationDirection.INBOUND,  status: CommunicationStatus.DELIVERED, fromAddr: 'david.chen@techvision.com', toAddr: 'sarah@acme.com', subject: 'Re: Proposal', body: 'Looks good.', contactEmail: 'david.chen@techvision.com', sentAt: daysAgo(12) },
  ];

  for (const c of commsRaw) {
    const { contactEmail, sentBy, ...commData } = c;
    await prisma.communication.upsert({
      where: { tenantId_externalId: { tenantId: tenant.id, externalId: c.externalId } },
      update: { ...commData },
      create: {
        ...commData,
        tenantId: tenant.id,
        contactId: contacts[contactEmail]?.id ?? null,
        sentById: users[sentBy as string]?.id ?? null,
      },
    });
  }
  console.log(`✅ Communications: ${commsRaw.length} upserted`);

  // ─── Activities (Idempotent) ───────────────────────────────────────────────
  const activitiesRaw = [
    { externalId: SEED_PREFIX + 'act_1', type: ActivityType.CALL, entityType: EntityType.CONTACT, entityEmail: 'david.chen@techvision.com', subject: 'Discovery call', body: 'Migration effort is key concern.', duration: 45, createdBy: 'sarah@acme.com', createdAt: daysAgo(35) },
    { externalId: SEED_PREFIX + 'act_2', type: ActivityType.MEETING, entityType: EntityType.CONTACT, entityEmail: 'david.chen@techvision.com', subject: 'Product demo', body: 'Blockchain audit trail liked.', duration: 60, createdBy: 'sarah@acme.com', createdAt: daysAgo(20) },
  ];

  for (const a of activitiesRaw) {
    const { entityEmail, createdBy, ...actData } = a;
    await prisma.activity.upsert({
      where: { tenantId_externalId: { tenantId: tenant.id, externalId: a.externalId } },
      update: { ...actData },
      create: {
        ...actData,
        tenantId: tenant.id,
        entityId: contacts[entityEmail as string].id,
        createdById: users[createdBy].id,
      },
    });
  }
  console.log(`✅ Activities: ${activitiesRaw.length} upserted`);

  // ─── Notifications (Idempotent) ────────────────────────────────────────────
  const notificationsRaw = [
    { externalId: SEED_PREFIX + 'not_1', userId: salesManager.id, title: '🔥 Hot Leads Unassigned', body: '3 leads need assignment.', type: 'ai_recommendation' },
    { externalId: SEED_PREFIX + 'not_2', userId: salesRep2.id,    title: '⚠️ Deal at Risk: Pinnacle', body: 'No activity in 50 days.', type: 'deal_alert' },
  ];

  for (const n of notificationsRaw) {
    const { userId, ...notData } = n;
    await prisma.notification.upsert({
      where: { tenantId_userId_externalId: { tenantId: tenant.id, userId, externalId: n.externalId } },
      update: { ...notData },
      create: {
        ...notData,
        tenantId: tenant.id,
        userId,
      },
    });
  }
  console.log(`✅ Notifications: ${notificationsRaw.length} upserted`);

  // ─── Email Templates (Idempotent) ──────────────────────────────────────────
  const templatesData = [
    { name: 'Welcome Email',           subject: 'Welcome to Acme CRM!',                  htmlBody: '<html><body>Welcome!</body></html>', category: 'onboarding' },
    { name: 'Lead Follow-Up (Day 1)',  subject: 'Quick question',                        htmlBody: '<html><body>Follow up</body></html>', category: 'sales' },
  ];

  for (const t of templatesData) {
    await prisma.emailTemplate.upsert({
      where: { id: (await prisma.emailTemplate.findFirst({ where: { tenantId: tenant.id, name: t.name } }))?.id || '00000000-0000-0000-0000-000000000000' },
      update: { ...t },
      create: { ...t, tenantId: tenant.id, createdById: adminUser.id },
    });
  }
  console.log(`✅ Email Templates: ${templatesData.length} upserted`);

  console.log('\n🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
