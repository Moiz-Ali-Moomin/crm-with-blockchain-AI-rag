/**
 * RagService — Retrieval-Augmented Generation pipeline
 *
 * Orchestration layer that chains together:
 *   1. Vector search   — find semantically similar CRM records
 *   2. Context window  — format top-K results into a prompt context
 *   3. LLM completion  — GPT-4o answers the query using only retrieved facts
 *   4. Caching         — identical query+filter combos cached for 2 minutes
 *   5. Audit log       — every call persisted to MongoDB (fire-and-forget)
 *
 * Tenant isolation:
 *   - Every DB query includes tenantId constraint (pgvector WHERE clause)
 *   - Cache keys are namespaced per tenant
 *   - MongoDB logs always carry tenantId
 *
 * Prompt injection defence:
 *   - System prompt is static and hardcoded — no user input reaches it
 *   - User question is placed in the `user` message, not the `system` message
 *   - Temperature is 0.2 (near-deterministic) for factual retrieval tasks
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { createHash } from 'crypto';
import { VectorSearchService, SemanticSearchResult } from './vector-search.service';
import { AiLogRepository } from './repositories/ai-log.repository';
import { RedisService } from '../../core/cache/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../../core/cache/cache-keys';
import { AiOperationType } from './types/ai-operation-type.enum';

export interface RagQueryParams {
  tenantId: string;
  query: string;
  entityTypes?: ('activity' | 'communication' | 'ticket')[];
  topK?: number;
  threshold?: number;
}

export interface RagSource {
  entityType: string;
  entityId: string;
  similarity: number;
  excerpt: string;
}

export interface RagResponse {
  answer: string;
  sources: RagSource[];
  confidence: number;
  fromCache: boolean;
  latencyMs?: number;
  tokensUsed?: number;
}

const MAX_CONTEXT_CHARS = 12000;

const RAG_SYSTEM_PROMPT = `You are an intelligent CRM assistant with access to retrieved customer interaction records.

Answer ONLY using provided context. If not enough info, say so. Be concise and factual.`;

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly openai: OpenAI;
  private readonly model = 'gpt-4o';

 constructor(
  private readonly config: ConfigService,
  private readonly vectorSearch: VectorSearchService,
  private readonly redis: RedisService, // ✅ move UP
  @Optional() private readonly aiLogRepo?: AiLogRepository, // ✅ move LAST
) {
  this.openai = new OpenAI({
    apiKey: this.config.get<string>('OPENAI_API_KEY') ?? 'not-configured',
  });
}

  async query(params: RagQueryParams): Promise<RagResponse> {
    const {
      tenantId,
      query,
      entityTypes = ['activity', 'communication', 'ticket'],
      topK = 8,
      threshold = 0.72,
    } = params;

    const paramHash = createHash('sha256')
      .update(`${query}:${[...entityTypes].sort().join(',')}:${topK}:${threshold}`)
      .digest('hex')
      .slice(0, 16);

    const cacheKey = CACHE_KEYS.aiSearchResults(tenantId, `rag:${paramHash}`);
    const cached = await this.redis.get<RagResponse>(cacheKey);

    if (cached) {
      this.logFireAndForget({
        tenantId,
        operationType: AiOperationType.RAG_QUERY,
        prompt: `[cached] ${query}`,
        response: cached.answer,
        metadata: { entityTypes, topK, threshold },
      });

      return { ...cached, fromCache: true };
    }

    const chunks = await this.vectorSearch.search({
      tenantId,
      query,
      entityTypes,
      limit: topK,
      threshold,
    });

    if (chunks.length === 0) {
      const response: RagResponse = {
        answer: 'I could not find any relevant CRM records for your query.',
        sources: [],
        confidence: 0,
        fromCache: false,
      };

      this.logFireAndForget({
        tenantId,
        operationType: AiOperationType.RAG_QUERY,
        prompt: query,
        response: response.answer,
      });

      return response;
    }

    const contextWindow = this.buildContextWindow(chunks);

    if (!this.config.get<string>('OPENAI_API_KEY')) {
      throw new Error('OPENAI_API_KEY missing');
    }

    const start = Date.now();

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: 'system', content: RAG_SYSTEM_PROMPT },
        { role: 'user', content: `CRM Context:\n${contextWindow}\n\nQuestion: ${query}` },
      ],
    });

    const latencyMs = Date.now() - start;

    const answer = completion.choices[0].message.content ?? '';
    const tokensUsed = completion.usage?.total_tokens;

    const round3 = (n: number) => Math.round(n * 1000) / 1000;

    const confidence = round3(
      chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length,
    );

    const sources: RagSource[] = chunks.map((c) => ({
      entityType: c.entityType,
      entityId: c.entityId,
      similarity: round3(c.similarity),
      excerpt: c.content.slice(0, 200),
    }));

    const result: RagResponse = {
      answer,
      sources,
      confidence,
      fromCache: false,
      latencyMs,
      tokensUsed,
    };

    await this.redis.set(cacheKey, result, CACHE_TTL.AI_SEARCH);

    this.logFireAndForget({
      tenantId,
      operationType: AiOperationType.RAG_QUERY,
      prompt: query,
      response: answer,
      latencyMs,
      metadata: {
        model: this.model,
        temperature: 0.2,
      },
    });

    return result;
  }

  private buildContextWindow(chunks: SemanticSearchResult[]): string {
    let output = '';
    let size = 0;

    for (const chunk of chunks) {
      const block = `[${chunk.entityType}] ${chunk.content}\n\n`;

      if (size + block.length > MAX_CONTEXT_CHARS) break;

      output += block;
      size += block.length;
    }

    return output;
  }

  private logFireAndForget(params: {
    tenantId: string;
    operationType: AiOperationType;
    prompt: string;
    response: string;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
  }): void {
    if (!this.aiLogRepo) return; // ✅ CRITICAL FIX

    this.aiLogRepo
      .create({
        tenantId: params.tenantId,
        operationType: params.operationType,
        prompt: params.prompt,
        response: params.response,
        latencyMs: params.latencyMs,
        metadata: params.metadata ?? {},
      })
      .catch((err: Error) => {
        this.logger.warn(`RAG log failed: ${err.message}`);
      });
  }
}