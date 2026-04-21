# ─────────────────────────────────────────
# Base image
# ─────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

# ─────────────────────────────────────────
# Dependencies (install once)
# ─────────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

# ─────────────────────────────────────────
# Builder (generate Prisma + build)
# ─────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY nest-cli.json tsconfig.json ./
COPY src ./src

# ✅ Generate Prisma client
RUN npx prisma generate

# ✅ Build NestJS app
RUN npm run build

# ─────────────────────────────────────────
# Runner (production)
# ─────────────────────────────────────────
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3001

# ✅ IMPORTANT: reuse node_modules from builder (DO NOT reinstall)
COPY --from=builder /app/node_modules ./node_modules

# Copy built app + prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nestjs \
    && mkdir -p /app/logs \
    && chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3001

# Optional healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/v1/health/live || exit 1

# Run migrations + start app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]