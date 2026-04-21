import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { IEmbeddingService } from './embedding.interface';
import {
  EmbeddingProvider,
  EMBEDDING_PROVIDER,
} from './providers/embedding-provider.interface';
import { EntityType } from '@prisma/client'; // ✅ IMPORTANT

@Injectable()
export class RealEmbeddingService implements IEmbeddingService {
  private readonly logger = new Logger(RealEmbeddingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  async generateEmbedding(text: string): Promise<number[]> {
    return this.embeddingProvider.embed(text);
  }

  async upsertEmbedding(params: {
    tenantId: string;
    entityType: EntityType; // ✅ FIXED (was string)
    entityId: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { tenantId, entityType, entityId, content, embedding, metadata } =
      params;

    await this.prisma.withoutTenantScope(() =>
      this.prisma.aiEmbedding.upsert({
        where: {
          tenantId_entityType_entityId: {
            tenantId,
            entityType,
            entityId,
          },
        },
        create: {
          tenantId,
          entityType,
          entityId,
          content,
          metadata: (metadata ?? {}) as object,
        },
        update: {
          content,
          metadata: (metadata ?? {}) as object,
          updatedAt: new Date(),
        },
      }),
    );

    // Store vector via raw SQL (pgvector)
    const vectorLiteral = `[${embedding.join(',')}]`;

    await this.prisma.$executeRaw`
      UPDATE ai_embeddings
      SET embedding = ${vectorLiteral}::vector
      WHERE tenant_id   = ${tenantId}
        AND entity_type = ${entityType}
        AND entity_id   = ${entityId}
    `;

    this.logger.debug(
      `Embedding upserted: ${entityType}/${entityId} (tenant: ${tenantId})`,
    );
  }

  async deleteEmbedding(
    tenantId: string,
    entityType: EntityType, // ✅ FIXED
    entityId: string,
  ): Promise<void> {
    await this.prisma.withoutTenantScope(() =>
      this.prisma.aiEmbedding.deleteMany({
        where: { tenantId, entityType, entityId },
      }),
    );
  }
}