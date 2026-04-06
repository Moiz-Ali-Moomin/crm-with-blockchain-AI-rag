# AI & RAG Pipeline

## Overview

NexusCRM ships with a production-grade AI layer built on OpenAI APIs and `pgvector` (PostgreSQL vector extension). It includes:

| Feature | Description |
|---|---|
| **RAG Pipeline** | Answer natural-language questions about your CRM data |
| **Vector Embeddings** | Semantic search across activities, tickets, and communications |
| **AI Copilot** | Contextual summaries and action suggestions on any record |
| **Lead Scoring** | Automated lead quality scoring recalculated via background queue |
| **AI Audit Log** | Every LLM call logged to MongoDB (latency, token usage, source chunks) |

All AI features are **opt-in** — they require `OPENAI_API_KEY` in `.env`. Without it, the endpoints return graceful errors and the rest of the CRM works normally.

---

## RAG Pipeline

### What it does

Retrieval-Augmented Generation (RAG) lets users ask questions in plain English like:

- *"What did we last discuss with Acme Corp?"*
- *"Which tickets from Q1 mentioned pricing issues?"*
- *"Summarise all activities on deal XYZ."*

The system answers using **only** your CRM data — it never invents facts.

### Pipeline Flow

```
User question
      │
      ▼
RagService.query()
      │
      ├─ 1. Cache check (Redis, 2 min TTL)
      │       └─ Hit? Return cached answer immediately
      │
      ▼
EmbeddingService.embed(question)
→ OpenAI text-embedding-ada-002
→ 1536-dimension vector
      │
      ▼
VectorSearchService.search()
→ pgvector cosine similarity
→ SELECT ... ORDER BY embedding <=> $queryVector
→ WHERE tenant_id = ? AND entity_type IN (?)
→ AND similarity > threshold (default: 0.72)
→ LIMIT topK (default: 8)
      │
      ▼
RagService.buildContextWindow()
→ Format top-K chunks (max 12,000 chars total)
→ Header: [N] ENTITY_TYPE (id: ..., similarity: 0.xxx)
      │
      ▼
OpenAI GPT-4o
→ system: static CRM assistant prompt (no user input in system message)
→ user: context + question
→ temperature: 0.2
→ max_tokens: 800
      │
      ▼
Cache result in Redis (2 min)
Log to MongoDB (fire-and-forget)
      │
      ▼
Return { answer, sources, confidence, latencyMs, tokensUsed }
```

### Tenant Isolation

Every pgvector search includes `WHERE tenant_id = ?`. Tenants can never see each other's data — not even through the AI.

### Prompt Injection Defence

- System prompt is **hardcoded** — no user input ever reaches it
- User question is placed in the `user` message only
- Temperature is 0.2 (near-deterministic) to reduce hallucination

---

## Vector Embeddings

### What gets embedded

| Entity Type | What is embedded |
|---|---|
| `activity` | Activity notes/description |
| `communication` | Email body / SMS body |
| `ticket` | Ticket description + all replies |

### Embedding flow

```
Record created/updated
         │
         ▼
Service enqueues BullMQ job → ai-embedding queue
         │
         ▼
AiEmbeddingWorker
         │
EmbeddingService.embed(text)
→ OpenAI text-embedding-ada-002
→ 1536-dim float vector
         │
Upsert into ai_embeddings table
(pgvector column type: vector(1536))
```

The embedding job is **async** — record creation is not blocked. If OpenAI is unavailable, BullMQ retries with exponential back-off.

### pgvector index

The schema uses an `ivfflat` index for approximate nearest-neighbour search:

```sql
CREATE INDEX idx_ai_embeddings_vector
ON ai_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

---

## AI Copilot

`CopilotService` provides on-demand, context-aware assistance for individual records.

### Endpoints

```
POST /ai/copilot/summarise
{
  "entityType": "deal",
  "entityId": "uuid"
}
```

```
POST /ai/copilot/suggest-actions
{
  "entityType": "lead",
  "entityId": "uuid"
}
```

Results are cached per entity for 10 minutes (`ai:summary:{tenantId}:{entityType}:{entityId}`).

---

## API Endpoints

All AI endpoints are under `/ai`.

### RAG Query

```
POST /ai/rag/query
```

Request:
```json
{
  "query": "What did we discuss with Acme Corp last month?",
  "entityTypes": ["activity", "communication"],
  "topK": 8,
  "threshold": 0.72
}
```

Response:
```json
{
  "answer": "Based on the retrieved records, your last discussion with Acme Corp was on March 15...",
  "sources": [
    {
      "entityType": "activity",
      "entityId": "uuid",
      "similarity": 0.891,
      "excerpt": "Call with John Smith — discussed Q2 renewal pricing..."
    }
  ],
  "confidence": 0.847,
  "fromCache": false,
  "latencyMs": 1243,
  "tokensUsed": 512
}
```

### Semantic Search

```
POST /ai/search
```

Request:
```json
{
  "query": "pricing objection",
  "entityTypes": ["ticket", "communication"],
  "limit": 10,
  "threshold": 0.70
}
```

---

## Audit Logging

Every AI operation is logged to MongoDB (collection: `ai_logs`).

Schema:
```typescript
{
  tenantId: string;
  operationType: 'rag_query' | 'embedding' | 'copilot_summary' | 'lead_score';
  prompt: string;
  response: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  servedFromCache: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
```

Logs are written **fire-and-forget** — they never add latency to the response path. A write failure is logged as a warning but does not surface to the user.

---

## Configuration

```bash
# Required — all AI features disabled without this
OPENAI_API_KEY=sk-xxx

# Optional tuning (defaults shown)
# No env vars needed — configured in code:
# RAG top-K: 8
# RAG similarity threshold: 0.72
# RAG temperature: 0.2
# RAG max tokens: 800
# RAG cache TTL: 120s
# Summary cache TTL: 600s
```

---

## Cost Estimation

| Operation | Model | Cost (approx) |
|---|---|---|
| Generate embedding | `text-embedding-ada-002` | $0.0001 / 1K tokens |
| RAG query | `gpt-4o` | ~$0.005–$0.015 per query |
| Copilot summary | `gpt-4o` | ~$0.005–$0.020 per summary |

With Redis caching (2–10 min TTL), repeated identical queries are free. For a small team of 10, typical monthly AI cost is **under $20**.

---

## Disabling AI Features

Set `OPENAI_API_KEY` to empty or omit it. The `RagService` and `EmbeddingService` will throw a configuration error caught by the controller, returning a `503 Service Unavailable` with a descriptive message. All non-AI CRM features are unaffected.
