'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// ─────────────────────────────────────────
// Endpoint (ensures /v1/traces)
// ─────────────────────────────────────────
const base =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  'http://crm_otel_collector:4318';

const endpoint = base.endsWith('/v1/traces')
  ? base
  : base + '/v1/traces';

// ─────────────────────────────────────────
// Service metadata (OTel v2 compatible)
// ─────────────────────────────────────────
const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]:
    process.env.OTEL_SERVICE_NAME || 'crm-api',
  [SemanticResourceAttributes.SERVICE_VERSION]:
    process.env.APP_VERSION || '1.0.0',
  'deployment.environment': process.env.NODE_ENV || 'production',
});

// ─────────────────────────────────────────
// SDK setup
// ─────────────────────────────────────────
const sdk = new NodeSDK({
  resource,

  traceExporter: new OTLPTraceExporter({
    url: endpoint,
  }),

  instrumentations: [
    getNodeAutoInstrumentations({
      // ✅ incoming + outgoing HTTP
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingPaths: [], // ensure nothing is skipped
      },

      // ✅ NestJS uses Express internally
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },

      // ✅ Redis (BullMQ / queues)
      '@opentelemetry/instrumentation-ioredis': {
        enabled: true,
      },

      // ✅ PostgreSQL
      '@opentelemetry/instrumentation-pg': {
        enabled: true,
      },
    }),
  ],
});

// ─────────────────────────────────────────
// Start SDK BEFORE app boots
// ─────────────────────────────────────────
try {
  sdk.start();
  console.log(`[OTEL] started → ${endpoint}`);
} catch (err) {
  console.error('[OTEL] failed to start', err);
}

// ─────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────
process.on('SIGTERM', async () => {
  try {
    await sdk.shutdown();
    console.log('[OTEL] shutdown complete');
  } catch (e) {
    console.error('[OTEL] shutdown error', e);
  } finally {
    process.exit(0);
  }
});