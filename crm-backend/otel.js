// otel.js
'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// ---- Config from env (with safe defaults) ----
const serviceName = process.env.OTEL_SERVICE_NAME || 'crm-api';
const endpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  'http://crm_otel_collector:4318/v1/traces';

// ---- Exporter ----
const traceExporter = new OTLPTraceExporter({
  url: endpoint, // HTTP/protobuf (4318)
});

// ---- SDK ----
const sdk = new NodeSDK({
  traceExporter,
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // you can tweak instrumentations here if needed
      // e.g. disable fs: { '@opentelemetry/instrumentation-fs': { enabled: false } }
    }),
  ],
});

// ---- Start early (before app code) ----
sdk
  .start()
  .then(() => {
    console.log(`[OTEL] started → ${endpoint}`);
  })
  .catch((err) => {
    console.error('[OTEL] failed to start', err);
  });

// ---- Graceful shutdown ----
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