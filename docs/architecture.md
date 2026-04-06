# Architecture

## Overview

NexusCRM is a monorepo containing two independently deployable applications:

| App | Framework | Port |
|---|---|---|
| `crm-backend` | NestJS 10 (TypeScript) | `3001` |
| `crm-frontend` | Next.js 15 (App Router) | `3000` |

Both apps are containerised with Docker and communicate over HTTP/WebSocket.

---

## System Diagram

```
Internet
    │
    ▼
┌─────────────────────────────────────┐
│             Nginx (443/80)           │
│  /          → web:3000 (Next.js)    │
│  /api/*     → api:3001 (NestJS)     │
│  /socket.io → api:3001 (WS)         │
└────────────────┬────────────────────┘
                 │
    ┌────────────┴──────────────┐
    │                           │
┌───▼────────┐         ┌────────▼────────┐
│  web:3000  │         │   api:3001      │
│  Next.js   │◄───────►│   NestJS        │
│  App Router│  REST   │   + Socket.io   │
└────────────┘  + WS   └───────┬─────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
         ┌────▼────┐    ┌──────▼──────┐  ┌──────▼──────┐
         │Postgres │    │    Redis    │  │   MongoDB   │
         │16+pgvec │    │ Cache+Queue │  │  AI Logs    │
         └─────────┘    └─────────────┘  └─────────────┘
```

---

## Backend Module Structure

```
src/
├── main.ts                     # Bootstrap: Helmet, Swagger, pipes, filters
├── app.module.ts               # Root module — imports all feature modules
│
├── config/
│   └── env.validation.ts       # Zod schema validates all env vars at startup
│
├── core/                       # @Global() — exported to every module
│   ├── core.module.ts
│   ├── database/
│   │   ├── prisma.service.ts           # PrismaClient + tenant middleware
│   │   ├── prisma-transaction.service.ts
│   │   ├── mongo.module.ts             # Mongoose connection
│   │   └── repositories/
│   ├── cache/
│   │   ├── redis.service.ts            # ioredis wrapper with get/set/del/ttl
│   │   └── cache-keys.ts               # All cache key factories + TTLs
│   ├── queue/
│   │   ├── queue.module.ts             # Registers all BullMQ queues
│   │   └── queue.constants.ts          # Queue name constants
│   └── websocket/
│       ├── ws.gateway.ts               # Socket.io gateway (auth + rooms)
│       └── ws.service.ts               # emit helpers
│
├── common/                     # Cross-cutting concerns
│   ├── guards/                 # JwtAuthGuard, RolesGuard, TenantGuard
│   ├── decorators/             # @CurrentUser(), @Roles(), @TenantId()
│   ├── filters/                # GlobalExceptionFilter → structured error shape
│   ├── interceptors/           # LoggingInterceptor, AuditLogInterceptor
│   ├── middleware/             # TenantContextMiddleware, RequestIdMiddleware
│   └── pipes/                  # ZodValidationPipe
│
├── shared/
│   ├── types/                  # Shared TypeScript interfaces
│   └── utils/                  # crypto.utils, pagination helpers
│
├── jobs/
│   ├── jobs.module.ts          # Registers all WorkerHost processors
│   └── workers/
│       ├── email.worker.ts
│       ├── sms.worker.ts
│       ├── notification.worker.ts
│       ├── automation.worker.ts
│       ├── webhook.worker.ts
│       ├── blockchain.worker.ts
│       └── ai-embedding.worker.ts
│
└── modules/                    # Feature modules (each: module, controller, service, repository, dto)
    ├── auth/
    ├── leads/
    ├── contacts/
    ├── companies/
    ├── deals/
    ├── pipelines/
    ├── tasks/
    ├── tickets/
    ├── activities/
    ├── communications/
    ├── notifications/
    ├── users/
    ├── tenant/
    ├── rbac/
    ├── webhooks/
    ├── billing/
    ├── integrations/
    ├── automation/
    ├── analytics/
    ├── ai/
    └── blockchain/
```

---

## Multi-Tenancy

Every resource in the system belongs to exactly one tenant.

**How it works:**

1. **JWT contains `tenantId`** — embedded at login time
2. **`TenantContextMiddleware`** — extracts `tenantId` from the verified JWT and stores it in `AsyncLocalStorage`
3. **Prisma middleware** — before every query, reads `tenantId` from `AsyncLocalStorage` and injects `WHERE tenant_id = ?`
4. **Guards** — `TenantGuard` verifies the authenticated user belongs to the requested tenant

This means no service needs to explicitly pass `tenantId` — it flows automatically through the call stack.

---

## Authentication

| Flow | Description |
|---|---|
| Login | `POST /auth/login` → returns `accessToken` (15m) + `refreshToken` (7d) |
| Refresh | `POST /auth/refresh` → rotates both tokens |
| Logout | `POST /auth/logout` → blacklists `jti` in Redis for 15m |
| Token blacklist | Redis key `auth:blacklist:{jti}` — checked on every request |

**Access token:** short-lived JWT (15m), sent as `Authorization: Bearer` header.  
**Refresh token:** long-lived JWT (7d), stored client-side, used only at `/auth/refresh`.

---

## Queue Architecture

All operations with side-effects are decoupled from the HTTP request path via BullMQ.

```
HTTP Request → Service → enqueue job → return 200 immediately
                                  ↓
                         BullMQ Queue (Redis)
                                  ↓
                         Worker processes job
                         (retry on failure, exponential back-off)
```

| Queue | Worker | Triggered By |
|---|---|---|
| `email` | EmailWorker | Communications module |
| `sms` | SmsWorker | Communications module |
| `notification` | NotificationWorker | Multiple modules |
| `automation` | AutomationWorker | Automation triggers |
| `webhook` | WebhookWorker | Webhook module |
| `blockchain` | BlockchainWorker | Deals module (deal won) |
| `ai-embedding` | AiEmbeddingWorker | Activities, Tickets, Communications |

---

## Caching Strategy

All cache operations go through `RedisService`. Keys are defined in `cache-keys.ts` to prevent magic strings.

| Resource | TTL | Invalidation trigger |
|---|---|---|
| Dashboard analytics | 5 min | Manual (no write invalidation) |
| CRM lists (leads, deals kanban) | 30 sec | Write/update/delete on that resource |
| Pipeline config | 10 min | Pipeline update |
| Tenant/user profile | 5 min | Profile update |
| RBAC permissions | 5 min | Role change |
| JWT blacklist | 15 min | Auto-expiry |
| AI/RAG results | 2 min | Auto-expiry |
| AI summaries | 10 min | Auto-expiry |
| Lead scores | 5 min | Score recalculation job |

---

## Frontend Architecture

```
src/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Auth route group (login, register, etc.)
│   └── (dashboard)/            # Protected route group
│       ├── layout.tsx          # AuthGuard + DashboardLayout
│       ├── dashboard/
│       ├── leads/
│       ├── contacts/
│       ├── companies/
│       ├── deals/
│       ├── pipeline/
│       ├── tasks/
│       ├── tickets/
│       ├── activities/
│       ├── communications/
│       ├── analytics/
│       ├── automation/
│       ├── notifications/
│       └── settings/
│
├── components/
│   ├── ui/                     # Base UI components (Button, Input, Card, Badge…)
│   ├── crm/                    # Domain components (StatusBadge, DataTable, Kanban…)
│   ├── layout/                 # Sidebar, Header, DashboardLayout
│   └── auth/                   # AuthGuard
│
├── lib/
│   ├── api/                    # axios API clients (one per module)
│   ├── query/                  # TanStack Query key factories
│   └── utils.ts                # cn(), formatCurrency, formatDate…
│
├── store/                      # Zustand stores (auth only — server state in TanStack Query)
├── hooks/                      # use-socket.ts, shared hooks
└── types/                      # All TypeScript types (mirrors backend DTOs)
```

**State management rule:**
- Server state (API data) → TanStack Query
- Client UI state (auth session, sidebar open) → Zustand
- Component state (form, modal open) → `useState`

---

## Database Schema Overview

20+ Prisma models. Key relationships:

```
Tenant
 ├── User (many)
 ├── Lead (many)
 ├── Contact (many)
 │     └── Company (belongs to)
 ├── Company (many)
 ├── Deal (many)
 │     ├── Pipeline → Stage
 │     └── BlockchainRecord (one)
 ├── Pipeline (many)
 │     └── Stage (many)
 ├── Task (many)
 ├── Ticket (many)
 │     └── TicketReply (many)
 ├── Activity (many, polymorphic)
 ├── Notification (many)
 ├── EmailTemplate (many)
 ├── WebhookConfig (many)
 │     └── WebhookDelivery (many)
 ├── AutomationWorkflow (many)
 ├── Integration (many)
 └── AiEmbedding (many, pgvector)
```

See `prisma/schema.prisma` for the full schema.
