/**
 * OllamaEmbeddingProvider — Primary embedding implementation
 *
 * Calls the local Ollama HTTP API to generate text embeddings using
 * the `nomic-embed-text` model (768-dimensional, production-quality).
 *
 * Why Ollama first?
 *   - Zero cost (runs locally / on-prem)
 *   - Low latency on GPU-equipped machines
 *   - No API key required
 *
 * Requirements:
 *   Ollama must be running: `ollama serve`
 *   Model must be pulled:   `ollama pull nomic-embed-text`
 *
 * Configuration:
 *   OLLAMA_BASE_URL  — default: http://localhost:11434
 *   OLLAMA_MODEL     — default: nomic-embed-text
 */

import { Logger } from '@nestjs/common';
import { EmbeddingProvider } from './embedding-provider.interface';

interface OllamaEmbeddingConfig {
  baseUrl?: string;
  model?: string;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(OllamaEmbeddingProvider.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: OllamaEmbeddingConfig = {}) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.model = config.model ?? 'nomic-embed-text';
  }

  async embed(text: string): Promise<number[]> {
    const url = `${this.baseUrl}/api/embeddings`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
        signal: AbortSignal.timeout(10_000), // 10 s timeout
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Ollama unreachable at ${this.baseUrl}: ${message}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Ollama returned ${response.status}: ${body}`);
    }

    const data = (await response.json()) as OllamaEmbeddingResponse;

    if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
      throw new Error('Ollama returned an empty embedding vector');
    }

    this.logger.debug(
      `[Embedding] Ollama generated ${data.embedding.length}-dim vector (model=${this.model})`,
    );

    return data.embedding;
  }
}
