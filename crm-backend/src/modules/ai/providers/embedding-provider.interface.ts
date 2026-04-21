/**
 * embedding-provider.interface.ts — Core embedding provider contract
 *
 * All embedding implementations (Ollama, OpenAI, …) must implement
 * EmbeddingProvider. This is a narrower interface than IEmbeddingService —
 * it covers only vector generation, not persistence.
 *
 * Why separate from IEmbeddingService?
 *   IEmbeddingService (embedding.interface.ts) is the NestJS-level contract
 *   that includes upsert/delete operations against the database. That interface
 *   must remain stable for VectorSearchService and the BullMQ worker.
 *
 *   EmbeddingProvider is a lower-level "network call" interface used by the
 *   factory and real-embedding.service.ts internally. Separating them lets
 *   us swap embedding APIs without touching the DB layer.
 */

/** Minimal contract for generating a text embedding vector */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

/** NestJS DI injection token */
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
