'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const endpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  'http://crm_otel_collector:4318/v1/traces';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: endpoint,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

// ✅ NO .then()
try {
  sdk.start();
  console.log(`[OTEL] started → ${endpoint}`);
} catch (err) {
  console.error('[OTEL] failed to start', err);
}

// graceful shutdown
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