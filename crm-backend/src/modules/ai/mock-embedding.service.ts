/**
 * MockEmbeddingService
 *
 * No-op implementation of IEmbeddingService for CI, smoke tests, and
 * environments where OPENAI_API_KEY is not set (ENABLE_AI=false).
 *
 * Behaviour:
 * - generateEmbedding() returns a zero-vector of the correct dimension (1536).
 *   This means vector searches will return no results (cosine similarity against
 *   a zero-vector is undefined / meaningless) — which is correct: AI features
 *   are disabled, returning empty is safe and honest.
 * - upsertEmbedding() / deleteEmbedding() are no-ops. They log a debug message
 *   so operators can see AI indexing is disabled without noisy errors.
 * - Never throws. Never makes network calls.
 *
 * WHY a zero-vector instead of random:
 *   Random vectors would produce non-deterministic similarity scores and could
 *   cause tests to pass/fail based on RNG. Zero-vector is deterministic and
 *   signals "not embedded" unambiguously.
 */

import { Injectable, Logger } from '@nestjs/common';
import { IEmbeddingService } from './embedding.interface';

const DIMENSIONS = 1536;

@Injectable()
export class MockEmbeddingService implements IEmbeddingService {
  private readonly logger = new Logger(MockEmbeddingService.name);

  async generateEmbedding(_text: string): Promise<number[]> {
    this.logger.debug('MockEmbeddingService: returning zero-vector (AI disabled)');
    return new Array(DIMENSIONS).fill(0);
  }

  async upsertEmbedding(params: {
    tenantId: string;
    entityType: string;
    entityId: string;
  }): Promise<void> {
    this.logger.debug(
      `MockEmbeddingService: skipping upsert for ${params.entityType}/${params.entityId} (AI disabled)`,
    );
  }

  async deleteEmbedding(
    _tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    this.logger.debug(
      `MockEmbeddingService: skipping delete for ${entityType}/${entityId} (AI disabled)`,
    );
  }
}
