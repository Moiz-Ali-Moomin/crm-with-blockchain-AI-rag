/**
 * AiModule — dynamic provider selection based on ENABLE_AI + LLM/Embedding ENV vars
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  LLM_PROVIDER=anthropic (default) → AnthropicLLMProvider                  │
 * │  LLM_FALLBACK=openai   (default) → OpenAILLMProvider on error             │
 * │                                                                             │
 * │  EMBEDDING_PROVIDER=ollama (default) → OllamaEmbeddingProvider            │
 * │  EMBEDDING_FALLBACK=openai (default) → OpenAIEmbeddingProvider on error   │
 * │                                                                             │
 * │  ENABLE_AI=false OR no API keys → MockEmbeddingService (AI disabled)      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Provider tokens:
 *   LLM_PROVIDER       → LLMProvider interface (used by RagService, CopilotService)
 *   EMBEDDING_SERVICE  → IEmbeddingService interface (used by VectorSearchService, worker)
 *   EMBEDDING_PROVIDER → EmbeddingProvider interface (used internally by RealEmbeddingService)
 *
 * Adding a new LLM provider later:
 *   1. Create a class implementing LLMProvider in providers/
 *   2. Add a case to buildLLMProvider() in ai-provider.factory.ts
 *   3. Set LLM_PROVIDER=<new-name> in .env — zero other changes needed.
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/database/prisma.service';

import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { VectorSearchService } from './vector-search.service';
import { CopilotService } from './copilot.service';
import { RagService } from './rag.service';
import { AiCostControlService } from './cost-control.service';

import { EMBEDDING_SERVICE } from './embedding.interface';
import { RealEmbeddingService } from './real-embedding.service';
import { MockEmbeddingService } from './mock-embedding.service';

import { LLM_PROVIDER } from './providers/llm.interface';
import { EMBEDDING_PROVIDER } from './providers/embedding-provider.interface';
import { AIProviderFactory } from './providers/ai-provider.factory';

import { AiLog, AiLogSchema } from './schemas/ai-log.schema';
import { AiLogRepository } from './repositories/ai-log.repository';
import { QUEUE_NAMES } from '../../core/queue/queue.constants';
import { BlockchainModule } from '../blockchain/blockchain.module';

// 🔥 same flag as CoreModule
const isMongoEnabled = !!process.env.MONGO_URI;

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.AI_EMBEDDING }),

    // ✅ ONLY register Mongo schema if Mongo exists
    ...(isMongoEnabled
      ? [
          MongooseModule.forFeature([
            { name: AiLog.name, schema: AiLogSchema },
          ]),
        ]
      : []),

    BlockchainModule,
    ConfigModule,
  ],

  controllers: [AiController],

  providers: [
    // ── LLM_PROVIDER: Anthropic → OpenAI fallback ────────────────────────────
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => AIProviderFactory.getLLM(config),
    },

    // ── EMBEDDING_PROVIDER: Ollama → OpenAI fallback (raw vector generation) ─
    {
      provide: EMBEDDING_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => AIProviderFactory.getEmbedding(config),
    },

    // ── EMBEDDING_SERVICE: full IEmbeddingService (includes DB upsert/delete) ─
    {
      provide: EMBEDDING_SERVICE,
      inject: [ConfigService, PrismaService, EMBEDDING_PROVIDER],
      useFactory: (
        config: ConfigService,
        prisma: PrismaService,
        embeddingProvider: ReturnType<typeof AIProviderFactory.getEmbedding>,
      ) => {
        const enabled = config.get<string>('ENABLE_AI') === 'true';
        const hasAnyKey =
          !!config.get<string>('ANTHROPIC_API_KEY') ||
          !!config.get<string>('OPENAI_API_KEY');

        if (enabled && hasAnyKey) {
          return new RealEmbeddingService(prisma, embeddingProvider);
        }

        return new MockEmbeddingService();
      },
    },

    AiService,
    VectorSearchService,
    CopilotService,
    RagService,
    AiCostControlService,

    // ✅ ONLY provide repository if Mongo exists
    ...(isMongoEnabled ? [AiLogRepository] : []),
  ],

  exports: [
    LLM_PROVIDER,
    EMBEDDING_SERVICE,
    EMBEDDING_PROVIDER,
    RagService,
    AiCostControlService,
    BullModule,

    ...(isMongoEnabled ? [AiLogRepository] : []),
  ],
})
export class AiModule {}