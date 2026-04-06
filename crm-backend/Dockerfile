# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: deps — install production dependencies only
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: builder — compile TypeScript
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Generate Prisma client before build
RUN npx prisma generate

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: runner — minimal production image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Security: run as non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nestjs

# Only copy what's needed at runtime
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/prisma       ./prisma

# Prisma requires the schema at runtime for migrations
COPY package.json ./

ENV NODE_ENV=production

USER nestjs

EXPOSE 3001

# Apply pending migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
