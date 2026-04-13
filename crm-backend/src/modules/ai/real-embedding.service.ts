/**
 * RealEmbeddingService
 *
 * Production implementation of IEmbeddingService.
 * Calls OpenAI `text-embedding-3-small` and persists vectors to ai_embeddings.
 *
 * Only provided when ENABLE_AI=true and OPENAI_API_KEY is set.
 * Never instantiated in CI smoke tests or environments without an API key.
 *
 * Design decisions:
 * - openai client is constructed lazily in the constructor — at that point
 *   the module factory has already confirmed OPENAI_API_KEY exists, so
 *   config.get() (not getOrThrow) is safe and sufficient.
 * - Upsert is idempotent on (tenantId, entityType, entityId).
 * - Always enqueued via AiEmbeddingWorker — never on the hot path.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../core/database/prisma.service';
import { IEmbeddingService } from './embedding.interface';

@Injectable()
export class RealEmbeddingService implements IEmbeddingService {
  private readonly logger = new Logger(RealEmbeddingService.name);
  private readonly openai: OpenAI;
  private readonly model = 'text-embedding-3-small';
  private readonly DIMENSIONS = 1536;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // config.get() is intentional — the AiModule factory guarantees this key
    // exists before providing this class. getOrThrow is not needed here and
    // would be redundant after the module-level guard.
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY') ?? '',
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const truncated = text.slice(0, 30000);
    const response = await this.openai.embeddings.create({
      model: this.model,
      input: truncated,
      dimensions: this.DIMENSIONS,
    });
    return response.data[0].embedding;
  }

  async upsertEmbedding(params: {
    tenantId: string;
    entityType: string;
    entityId: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { tenantId, entityType, entityId, content, embedding, metadata } = params;

    await this.prisma.withoutTenantScope(() =>
      this.prisma.aiEmbedding.upsert({
        where: { tenantId_entityType_entityId: { tenantId, entityType, entityId } },
        create: { tenantId, entityType, entityId, content, metadata: (metadata ?? {}) as any },
        update: { content, metadata: (metadata ?? {}) as any, updatedAt: new Date() },
      }),
    );

    const vectorLiteral = `[${embedding.join(',')}]`;
    await this.prisma.$executeRaw`
      UPDATE ai_embeddings
      SET embedding = ${vectorLiteral}::vector
      WHERE tenant_id   = ${tenantId}
        AND entity_type = ${entityType}
        AND entity_id   = ${entityId}
    `;

    this.logger.debug(`Embedding upserted: ${entityType}/${entityId} (tenant: ${tenantId})`);
  }

  async deleteEmbedding(tenantId: string, entityType: string, entityId: string): Promise<void> {
    await this.prisma.withoutTenantScope(() =>
      this.prisma.aiEmbedding.deleteMany({ where: { tenantId, entityType, entityId } }),
    );
  }
}
