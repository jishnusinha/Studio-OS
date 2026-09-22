/**
 * Lightweight OpenTelemetry-style tracing.
 * In-memory by default; optional OTLP/HTTP export when
 * OTEL_EXPORTER_OTLP_ENDPOINT is set (no-op when unset).
 */

export type SpanStatus = 'ok' | 'error';

export interface Span {
  name: string;
  attributes: Record<string, string | number | boolean>;
  startMs: number;
  endMs?: number;
  status: SpanStatus;
  error?: string;
}

export interface Tracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): SpanHandle;
}

export interface SpanHandle {
  setAttribute(key: string, value: string | number | boolean): void;
  recordError(err: unknown): void;
  end(status?: SpanStatus): Span;
}

const sink: Span[] = [];

let otlpEndpoint: string | null = null;
let serviceName = 'studio-os';
let initialized = false;

export function getCompletedSpans(): readonly Span[] {
  return sink;
}

export function clearSpans(): void {
  sink.length = 0;
}

/** Whether OTLP export is active (endpoint configured). */
export function isOtlpEnabled(): boolean {
  return Boolean(otlpEndpoint);
}

function toOtlpAttributes(
  attrs: Record<string, string | number | boolean>,
): Array<{ key: string; value: Record<string, unknown> }> {
  return Object.entries(attrs).map(([key, value]) => {
    if (typeof value === 'string') return { key, value: { stringValue: value } };
    if (typeof value === 'boolean') return { key, value: { boolValue: value } };
    return { key, value: { doubleValue: value } };
  });
}

function exportSpanOtLp(span: Span): void {
  if (!otlpEndpoint) return;
  const base = otlpEndpoint.replace(/\/$/, '');
  const url = base.endsWith('/v1/traces') ? base : `${base}/v1/traces`;
  const startNs = BigInt(span.startMs) * 1_000_000n;
  const endNs = BigInt(span.endMs ?? span.startMs) * 1_000_000n;
  const body = {
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: serviceName } }],
        },
        scopeSpans: [
          {
            scope: { name: '@studio-os/observability' },
            spans: [
              {
                name: span.name,
                startTimeUnixNano: startNs.toString(),
                endTimeUnixNano: endNs.toString(),
                attributes: toOtlpAttributes(span.attributes),
                status: {
                  code: span.status === 'error' ? 2 : 1,
                  message: span.error ?? '',
                },
              },
            ],
          },
        ],
      },
    ],
  };

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {
    /* fire-and-forget; never block local DX */
  });
}

class LocalSpanHandle implements SpanHandle {
  private readonly span: Span;

  constructor(name: string, attributes: Record<string, string | number | boolean> = {}) {
    this.span = {
      name,
      attributes: { ...attributes },
      startMs: Date.now(),
      status: 'ok',
    };
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.span.attributes[key] = value;
  }

  recordError(err: unknown): void {
    this.span.status = 'error';
    this.span.error = err instanceof Error ? err.message : String(err);
  }

  end(status: SpanStatus = this.span.status): Span {
    this.span.status = status;
    this.span.endMs = Date.now();
    const completed = { ...this.span, attributes: { ...this.span.attributes } };
    sink.push(completed);
    exportSpanOtLp(completed);
    return this.span;
  }
}

export const tracer: Tracer = {
  startSpan(name, attributes) {
    return new LocalSpanHandle(name, attributes);
  },
};

export interface InitTelemetryOptions {
  /** Override env OTEL_EXPORTER_OTLP_ENDPOINT */
  endpoint?: string | null;
  serviceName?: string;
}

/**
 * Optional OpenTelemetry bootstrap.
 * No-op when `OTEL_EXPORTER_OTLP_ENDPOINT` (or options.endpoint) is unset.
 * Safe to call multiple times.
 */
export function initTelemetry(opts: InitTelemetryOptions = {}): void {
  if (initialized && opts.endpoint === undefined) return;
  initialized = true;
  serviceName = opts.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'studio-os';
  const fromEnv = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || null;
  const endpoint =
    opts.endpoint === undefined ? fromEnv : opts.endpoint?.trim() ? opts.endpoint.trim() : null;
  otlpEndpoint = endpoint;
  if (otlpEndpoint) {
    console.log(`[observability] OTLP export enabled → ${otlpEndpoint}`);
  }
}

/** AI observability rollups from completed generation-like spans */
export function aiObservabilityRollup(spans: readonly Span[] = sink) {
  const gen = spans.filter((s) => s.name.startsWith('generation.'));
  const completed = gen.filter((s) => s.status === 'ok');
  const failed = gen.filter((s) => s.status === 'error');
  const totalCost = completed.reduce(
    (sum, s) => sum + (typeof s.attributes.costUsd === 'number' ? s.attributes.costUsd : 0),
    0,
  );
  const accepted = completed.filter((s) => s.attributes.accepted === true);
  const latencySum = completed.reduce((sum, s) => {
    if (s.endMs == null) return sum;
    return sum + (s.endMs - s.startMs);
  }, 0);

  return {
    generations: gen.length,
    completed: completed.length,
    failed: failed.length,
    accepted: accepted.length,
    costPerAccepted:
      accepted.length > 0
        ? totalCost / accepted.length
        : completed.length > 0
          ? totalCost / completed.length
          : 0,
    avgLatencyMs: completed.length > 0 ? latencySum / completed.length : 0,
    totalCostUsd: totalCost,
  };
}
