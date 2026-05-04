-- 1. Add missing externalId columns (Nullable)
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

-- 2. Create Unique Indexes (Standard UNIQUE INDEX handles NULLs correctly for Prisma upsert)

-- Stage: (pipelineId, name)
CREATE UNIQUE INDEX IF NOT EXISTS "stages_pipelineId_name_key" ON "stages"("pipelineId", "name");

-- Activity: (tenantId, externalId)
CREATE UNIQUE INDEX IF NOT EXISTS "activities_tenantId_externalId_key" ON "activities"("tenantId", "externalId");

-- Communication: (tenantId, externalId)
CREATE UNIQUE INDEX IF NOT EXISTS "communications_tenantId_externalId_key" ON "communications"("tenantId", "externalId");

-- Notification: (tenantId, userId, externalId)
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_tenantId_userId_externalId_key" ON "notifications"("tenantId", "userId", "externalId");
