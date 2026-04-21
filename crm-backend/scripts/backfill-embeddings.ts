/**
 * backfill-embeddings.ts
 *
 * One-shot script to re-index all existing CRM records into ai_embeddings.
 * Reads activities, communications, and tickets from PostgreSQL,
 * then calls Ollama (or OpenAI fallback) to generate embeddings via the
 * same provider stack used by the live app.
 *
 * Run ONCE on the VPS:
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-embeddings.ts
 *
 * Safe to run multiple times — upsert is idempotent.
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

// ── Config ────────────────────────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL    ?? 'nomic-embed-text';
const OPENAI_API_KEY  = process.env.OPENAI_API_KEY;
const EMBEDDING_FALLBACK = process.env.EMBEDDING_FALLBACK ?? 'openai';

const BATCH_DELAY_MS = 100; // small delay between calls to avoid hammering Ollama

// ── Embedding helpers ─────────────────────────────────────────────────────────

async function embedWithOllama(text: string): Promise<number[]> {
  const url = `${OLLAMA_BASE_URL}/api/embeddings`;
  const body = JSON.stringify({ model: OLLAMA_MODEL, prompt: text.slice(0, 8000) });

  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : http;
    const req = lib.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as { embedding: number[] };
          if (!parsed.embedding?.length) reject(new Error('Empty embedding from Ollama'));
          else resolve(parsed.embedding);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function embedWithOpenAI(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  const body = JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 30000), dimensions: 1536 });

  return new Promise((resolve, reject) => {
    const req = https.request('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as { data: { embedding: number[] }[] };
          resolve(parsed.data[0].embedding);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function embed(text: string): Promise<{ vector: number[]; provider: string }> {
  try {
    const vector = await embedWithOllama(text);
    return { vector, provider: 'ollama' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠ Ollama failed (${msg}) — trying fallback...`);
    if (EMBEDDING_FALLBACK === 'openai') {
      const vector = await embedWithOpenAI(text);
      return { vector, provider: 'openai' };
    }
    throw err;
  }
}

// ── Upsert embedding into DB ──────────────────────────────────────────────────

async function upsert(params: {
  tenantId: string;
  entityType: string;
  entityId: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { tenantId, entityType, entityId, content, embedding, metadata } = params;

  await (prisma as any).aiEmbedding.upsert({
    where: { tenantId_entityType_entityId: { tenantId, entityType, entityId } },
    create: { tenantId, entityType, entityId, content, metadata: metadata ?? {} },
    update: { content, metadata: metadata ?? {}, updatedAt: new Date() },
  });

  const vectorLiteral = `[${embedding.join(',')}]`;
  await prisma.$executeRaw`
    UPDATE ai_embeddings
    SET embedding = ${vectorLiteral}::vector
    WHERE tenant_id   = ${tenantId}
      AND entity_type = ${entityType}
      AND entity_id   = ${entityId}
  `;
}

// ── Backfill logic ─────────────────────────────────────────────────────────────

async function backfill() {
  console.log('🚀 Starting embedding backfill...\n');
  console.log(`   Ollama:   ${OLLAMA_BASE_URL} (model: ${OLLAMA_MODEL})`);
  console.log(`   Fallback: ${EMBEDDING_FALLBACK}\n`);

  let total = 0;
  let failed = 0;

  // ── Activities ─────────────────────────────────────────────────────────────
  const activities = await prisma.activity.findMany({
    select: { id: true, tenantId: true, subject: true, body: true, type: true },
  });
  console.log(`📋 Activities: ${activities.length}`);

  for (const a of activities) {
    const content = [a.subject, a.body].filter(Boolean).join('\n');
    if (!content.trim()) { console.log(`  skip (empty): activity/${a.id}`); continue; }
    try {
      const { vector, provider } = await embed(content);
      await upsert({ tenantId: a.tenantId, entityType: 'activity', entityId: a.id, content, embedding: vector, metadata: { type: a.type } });
      console.log(`  ✅ [${provider}] activity/${a.id.slice(0, 8)}...`);
      total++;
    } catch (err) {
      console.error(`  ❌ activity/${a.id}: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  // ── Communications ─────────────────────────────────────────────────────────
  const comms = await prisma.communication.findMany({
    select: { id: true, tenantId: true, subject: true, body: true, channel: true },
  });
  console.log(`\n💬 Communications: ${comms.length}`);

  for (const c of comms) {
    const content = [c.subject, c.body].filter(Boolean).join('\n');
    if (!content.trim()) { console.log(`  skip (empty): communication/${c.id}`); continue; }
    try {
      const { vector, provider } = await embed(content);
      await upsert({ tenantId: c.tenantId, entityType: 'communication', entityId: c.id, content, embedding: vector, metadata: { channel: c.channel } });
      console.log(`  ✅ [${provider}] communication/${c.id.slice(0, 8)}...`);
      total++;
    } catch (err) {
      console.error(`  ❌ communication/${c.id}: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  // ── Tickets ────────────────────────────────────────────────────────────────
  const tickets = await prisma.ticket.findMany({
    select: { id: true, tenantId: true, subject: true, description: true, status: true, priority: true },
  });
  console.log(`\n🎫 Tickets: ${tickets.length}`);

  for (const t of tickets) {
    const content = [t.subject, t.description].filter(Boolean).join('\n');
    if (!content.trim()) { console.log(`  skip (empty): ticket/${t.id}`); continue; }
    try {
      const { vector, provider } = await embed(content);
      await upsert({ tenantId: t.tenantId, entityType: 'ticket', entityId: t.id, content, embedding: vector, metadata: { status: t.status, priority: t.priority } });
      console.log(`  ✅ [${provider}] ticket/${t.id.slice(0, 8)}...`);
      total++;
    } catch (err) {
      console.error(`  ❌ ticket/${t.id}: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ Done! Indexed: ${total} | Failed: ${failed}`);
  console.log(`   Run the RAG query again to test retrieval.\n`);
}

backfill()
  .catch((err) => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
