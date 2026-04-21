/**
 * AIProviderFactory — Central provider selector with automatic fallback
 *
 * Creates provider instances based on ENV configuration and wraps them
 * in a transparent fallback proxy. Consumers receive a single provider
 * object; the fallback mechanism is invisible to them.
 *
 * ENV variables:
 *   LLM_PROVIDER         = anthropic | openai   (default: anthropic)
 *   LLM_FALLBACK         = openai | none        (default: openai)
 *   EMBEDDING_PROVIDER   = ollama | openai      (default: ollama)
 *   EMBEDDING_FALLBACK   = openai | none        (default: openai)
 *
 *   ANTHROPIC_API_KEY    — required when LLM_PROVIDER=anthropic or LLM_FALLBACK=anthropic
 *   OPENAI_API_KEY       — required when any provider/fallback = openai
 *   OLLAMA_BASE_URL      — optional (default: http://localhost:11434)
 *   OLLAMA_MODEL         — optional (default: nomic-embed-text)
 *
 * Fallback behaviour:
 *   - Primary is attempted first on every call
 *   - If primary throws ANY error, fallback provider is tried
 *   - Both provider name and error are logged at WARN level
 *   - If fallback is 'none' or misconfigured and primary fails, error is re-thrown
 *
 * Usage (inside NestJS factory provider):
 *   useFactory: (config: ConfigService) => AIProviderFactory.getLLM(config)
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMProvider } from './llm.interface';
import { EmbeddingProvider } from './embedding-provider.interface';
import { AnthropicLLMProvider } from './anthropic.service';
import { OpenAILLMProvider } from './openai-llm.service';
import { OllamaEmbeddingProvider } from './ollama-embedding.service';
import { OpenAIEmbeddingProvider } from './openai-embedding.service';

const factoryLogger = new Logger('AIProviderFactory');

// ─── LLM Factory ──────────────────────────────────────────────────────────────

function buildLLMProvider(name: string, config: ConfigService): LLMProvider | null {
  switch (name) {
    case 'anthropic': {
      const apiKey = config.get<string>('ANTHROPIC_API_KEY');
      if (!apiKey) {
        factoryLogger.warn('[LLM] ANTHROPIC_API_KEY not set — skipping Anthropic provider');
        return null;
      }
      return new AnthropicLLMProvider({
        apiKey,
        model: config.get<string>('LLM_MODEL'),
        maxTokens: config.get<number>('LLM_MAX_TOKENS'),
        temperature: config.get<number>('LLM_TEMPERATURE'),
      });
    }
    case 'openai': {
      const apiKey = config.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        factoryLogger.warn('[LLM] OPENAI_API_KEY not set — skipping OpenAI LLM provider');
        return null;
      }
      return new OpenAILLMProvider({ apiKey });
    }
    default:
      factoryLogger.warn(`[LLM] Unknown provider name: "${name}"`);
      return null;
  }
}

function buildEmbeddingProvider(name: string, config: ConfigService): EmbeddingProvider | null {
  switch (name) {
    case 'ollama':
      return new OllamaEmbeddingProvider({
        baseUrl: config.get<string>('OLLAMA_BASE_URL'),
        model: config.get<string>('OLLAMA_MODEL'),
      });
    case 'openai': {
      const apiKey = config.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        factoryLogger.warn('[Embedding] OPENAI_API_KEY not set — skipping OpenAI embedding provider');
        return null;
      }
      return new OpenAIEmbeddingProvider({ apiKey });
    }
    default:
      factoryLogger.warn(`[Embedding] Unknown provider name: "${name}"`);
      return null;
  }
}

// ─── Fallback proxy wrappers ───────────────────────────────────────────────────

function withLLMFallback(primary: LLMProvider, fallback: LLMProvider | null, primaryName: string): LLMProvider {
  return {
    async generate(input) {
      try {
        const result = await primary.generate(input);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        factoryLogger.warn(`[LLM] Primary provider (${primaryName}) failed: ${message}`);

        if (!fallback) {
          factoryLogger.error('[LLM] No fallback configured — re-throwing error');
          throw err;
        }

        factoryLogger.warn('[LLM] Switching to fallback provider');
        return fallback.generate(input);
      }
    },
  };
}

function withEmbeddingFallback(
  primary: EmbeddingProvider,
  fallback: EmbeddingProvider | null,
  primaryName: string,
): EmbeddingProvider {
  return {
    async embed(text) {
      try {
        return await primary.embed(text);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        factoryLogger.warn(`[Embedding] Primary provider (${primaryName}) failed: ${message}`);

        if (!fallback) {
          factoryLogger.error('[Embedding] No fallback configured — re-throwing error');
          throw err;
        }

        factoryLogger.warn('[Embedding] Switching to fallback provider');
        return fallback.embed(text);
      }
    },
  };
}

// ─── No-op stub (used when no API keys are configured) ───────────────────────

/**
 * Returns a stub LLMProvider that lets the app boot without any API keys.
 * All calls to generate() will throw at request time with a clear message,
 * so health checks pass while unauthenticated LLM routes fail gracefully.
 */
function buildNoOpLLMProvider(): LLMProvider {
  return {
    generate(_input): Promise<string> {
      const msg =
        '[AIProviderFactory] No LLM provider is configured. ' +
        'Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable LLM features.';
      factoryLogger.error(msg);
      return Promise.reject(new Error(msg));
    },
  };
}

// ─── Public Factory API ───────────────────────────────────────────────────────

export class AIProviderFactory {
  /**
   * Returns an LLMProvider wrapped with automatic fallback.
   * To be used as a NestJS `useFactory` value.
   *
   * When no API keys are configured the factory will NOT throw — it returns a
   * no-op stub instead. This ensures NestJS boots successfully for health checks
   * even in environments that omit AI credentials (e.g. CI smoke tests).
   * The stub will throw a clear error only when generate() is called at runtime.
   */
  static getLLM(config: ConfigService): LLMProvider {
    const primaryName = config.get<string>('LLM_PROVIDER') ?? 'anthropic';
    const fallbackName = config.get<string>('LLM_FALLBACK') ?? 'openai';

    const primary = buildLLMProvider(primaryName, config);
    const fallback = fallbackName !== 'none' ? buildLLMProvider(fallbackName, config) : null;

    if (!primary) {
      if (!fallback) {
        factoryLogger.warn(
          '[LLM] No API keys configured — LLM features disabled. ' +
          'Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable them.',
        );
        return buildNoOpLLMProvider();
      }
      factoryLogger.warn(`[LLM] Primary (${primaryName}) unavailable — using fallback (${fallbackName}) directly`);
      return fallback;
    }

    factoryLogger.log(`[LLM] Primary: ${primaryName}${fallback ? ` | Fallback: ${fallbackName}` : ' | No fallback'}`);
    return withLLMFallback(primary, fallback, primaryName);
  }

  /**
   * Returns an EmbeddingProvider wrapped with automatic fallback.
   * To be used as a NestJS `useFactory` value.
   */
  static getEmbedding(config: ConfigService): EmbeddingProvider {
    const primaryName = config.get<string>('EMBEDDING_PROVIDER') ?? 'ollama';
    const fallbackName = config.get<string>('EMBEDDING_FALLBACK') ?? 'openai';

    const primary = buildEmbeddingProvider(primaryName, config);
    const fallback = fallbackName !== 'none' ? buildEmbeddingProvider(fallbackName, config) : null;

    if (!primary) {
      if (!fallback) {
        throw new Error(
          `[AIProviderFactory] No Embedding provider could be initialised. ` +
          `Ensure Ollama is running or set OPENAI_API_KEY.`,
        );
      }
      factoryLogger.warn(`[Embedding] Primary (${primaryName}) unavailable — using fallback (${fallbackName}) directly`);
      return fallback;
    }

    factoryLogger.log(`[Embedding] Primary: ${primaryName}${fallback ? ` | Fallback: ${fallbackName}` : ' | No fallback'}`);
    return withEmbeddingFallback(primary, fallback, primaryName);
  }
}
