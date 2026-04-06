# Contributing

## Development Setup

Follow the [Quick Start](README.md#-quick-start) in the README to get your environment running.

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Production-ready. Every merge triggers a deploy. |
| `feat/*` | New features |
| `fix/*` | Bug fixes |
| `chore/*` | Tooling, CI, refactors |
| `docs/*` | Documentation only |

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add lead import from CSV
fix: prevent duplicate deal stage history entries
chore: upgrade Prisma to v5.9
docs: add blockchain setup guide
refactor: extract deal hash computation to shared util
test: add unit tests for AutomationEngine
```

## Adding a New Backend Module

1. Generate with NestJS CLI:
   ```bash
   cd crm-backend
   nest generate module modules/my-feature
   nest generate controller modules/my-feature
   nest generate service modules/my-feature
   ```

2. Follow the existing pattern:
   - `my-feature.module.ts` — imports `PrismaService` from `CoreModule`
   - `my-feature.controller.ts` — uses `@UseGuards(JwtAuthGuard, RolesGuard)`, Swagger decorators
   - `my-feature.service.ts` — calls repository, never Prisma directly
   - `my-feature.repository.ts` — all Prisma queries live here
   - `my-feature.dto.ts` — Zod schemas (not class-validator)

3. Register the module in `app.module.ts`

4. Add a Prisma migration if schema changed:
   ```bash
   npx prisma migrate dev --name add-my-feature
   ```

## Adding a New BullMQ Worker

1. Create `src/jobs/workers/my-feature.worker.ts`:
   ```typescript
   @Processor(QUEUE_NAMES.MY_FEATURE)
   export class MyFeatureWorker extends WorkerHost {
     async process(job: Job): Promise<void> { ... }
   }
   ```

2. Register in `src/jobs/jobs.module.ts` under `providers`

3. Add the queue name to `src/core/queue/queue.constants.ts`

4. Register the queue in `src/core/queue/queue.module.ts`

## Code Style Rules

- Use **Zod** for validation — never `class-validator`
- All Prisma queries go in the **repository** — services call repositories, not `PrismaService` directly
- New cache keys go in `cache-keys.ts` — no magic strings
- BullMQ jobs are always async — never block the HTTP path
- No `any` types without a comment explaining why
- Swagger decorators on every public controller endpoint

## Pull Request Checklist

See [.github/pull_request_template.md](.github/pull_request_template.md).

## Running CI Locally

```bash
# Backend
cd crm-backend
npm run lint
npx tsc --noEmit
npm test

# Frontend
cd crm-frontend
npm run lint
npx tsc --noEmit
npm run build
```
