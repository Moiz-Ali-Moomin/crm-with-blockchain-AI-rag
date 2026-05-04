-- Custom migration to fix missing unique constraints defined in schema but missing in DB history

-- 1. Stage: pipelineId + name
CREATE UNIQUE INDEX "stages_pipelineId_name_key" ON "stages"("pipelineId", "name");

-- 2. Activity: tenantId + externalId
CREATE UNIQUE INDEX "activities_tenantId_externalId_key" ON "activities"("tenantId", "externalId");

-- 3. Communication: tenantId + externalId
CREATE UNIQUE INDEX "communications_tenantId_externalId_key" ON "communications"("tenantId", "externalId");

-- 4. Notification: tenantId + userId + externalId
CREATE UNIQUE INDEX "notifications_tenantId_userId_externalId_key" ON "notifications"("tenantId", "userId", "externalId");
