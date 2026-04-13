/**
 * IEmbeddingService — contract for all embedding implementations.
 *
 * Injected via EMBEDDING_SERVICE token so the module can swap
 * RealEmbeddingService ↔ MockEmbeddingService without touching any consumer.
 *
 * Consumers (VectorSearchService, AiEmbeddingWorker) depend on this interface,
 * never on a concrete class — open/closed principle applied to external APIs.
 */
export interface IEmbeddingService {
  /**
   * Generate a 1536-dimensional embedding vector for the given text.
   * Real implementation calls OpenAI; mock returns a deterministic zero-vector.
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Upsert an embedding record into ai_embeddings (non-vector fields via ORM,
   * vector column via raw SQL).
   */
  upsertEmbedding(params: {
    tenantId: string;
    entityType: string;
    entityId: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }): Promise<void>;

  /**
   * Delete an embedding when the source entity is deleted.
   */
  deleteEmbedding(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<void>;
}

/** DI injection token — used in providers and @Inject() decorators */
export const EMBEDDING_SERVICE = Symbol('EMBEDDING_SERVICE');
