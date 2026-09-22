# StudioOS developer notes

## When Docker Desktop is available

```bash
pnpm docker:up
pnpm db:migrate
pnpm db:seed
pnpm dev:all
```

Demo: `demo@studioos.local` / `studioos-demo`

Projects:

| Slug | Type | Notes |
|------|------|-------|
| `tape-discovery` | cinema | Scene 17 shots A–D, Sarah, locked jacket fact |
| `aurora-bottle` | commercial | Brand DNA, Product Hero campaign, variant cells |
| `pro-studio-lab` | cinema | Continuity constraint, color look, multicam A/B stub, fine-tune dataset |

## Without Docker

Core packages still build and test:

```bash
pnpm --filter @studio-os/providers test
pnpm --filter @studio-os/billing test
pnpm --filter @studio-os/timeline test
pnpm --filter @studio-os/graph test
pnpm --filter @studio-os/media-synth test
pnpm --filter @studio-os/tests test
```

- Foundation vertical slice: `tests/vertical-slice.test.ts`
- Release 2 paths (Cinema / Commercial / authz / budget / undo): `tests/release2.test.ts`
- Release 3 paths (continuity / stems-MIDI / color+multicam / graph / billing / C2PA / claim gate): `tests/release3.test.ts`

## Workers & queues

`WorkflowEngine` (`@studio-os/workflow`):

- `TEMPORAL_ADDRESS` set → Temporal-shaped engine
- else `REDIS_URL` → BullMQ; run `pnpm dev:all` so generation/media/render workers consume queues
- else in-process (API can run generation inline)

Compose services: `postgres`, `redis`, `minio`, `generation-worker`, `media-worker`, `render-worker`.

Worker containers install **ffmpeg** via `apt-get` on start (node:22 image) so mock media can emit real codecs; host `pnpm dev:all` still uses local PATH.

## Authorization

Every tenant route uses `ProjectAccessGuard` / `WorkspaceAccessGuard` + `@ProjectScope` / `@RequireAction`. See [ADR 0006](adr/0006-authorization-model.md).

Jobs listing must pass `?projectId=` or returns only membership-scoped jobs.

## Mock media

`@studio-os/media-synth` produces playable (or CI-fallback) bytes. Prefer installing ffmpeg locally for real H.264 previews. See [ADR 0004](adr/0004-media-synthesis.md).

## Migrations

```bash
pnpm db:migrate
# 0000_init … 0002_rag_hnsw
# 0003_continuity, 0004_audio, 0005_music
# 0006_color / 0006_training, 0007_multicam / 0007_workflows
# 0008_collab, 0009_stripe (+ provenance seams)
```

## Environment additions (R3)

| Variable | Purpose |
|----------|---------|
| `TEMPORAL_ADDRESS` | Optional Temporal frontend (`host:port`). Unset → BullMQ / in-process |
| `TEMPORAL_NAMESPACE` | Temporal namespace (default `default`) |
| `STRIPE_SECRET_KEY` | Enables `StripeBillingProvider`; unset → mock billing |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP collector base URL; unset → in-memory tracer only |
| `OTEL_SERVICE_NAME` | Service name attribute (default `studio-os` / `studio-os-api`) |

API calls `initTelemetry()` from `main.ts` on boot.

## Notable R3 API routes

| Area | Routes |
|------|--------|
| Continuity | `POST /projects/:id/continuity/run`, checks, score repair |
| Audio | `/projects/:id/audio/stems/split`, dialogue, ADR, mix buses, dubbing |
| Music | project music / MIDI surfaces under `/projects/:id/music/*` |
| Color | `/projects/:id/color/grades`, looks, luts, clip-state, scopes |
| Multicam | `/projects/:id/multicam/groups`, angles, masks, roto, mattes |
| Workflows | `/projects/:id/workflows`, `/workflows/:id/runs`, `GET /workflows/steps` |
| Collab | `/projects/:id/collab/*`, WS `/collab` |
| Provenance | `POST /assets/:id/credentials/sign`, deliverable embed |
| Billing | Stripe webhook `POST /billing/webhooks/stripe` |
| Training / GPU | `/projects/:id/training/*`, `/gpu` |

## Observability

`@studio-os/observability` keeps the in-memory `tracer` API and `aiObservabilityRollup()`. When `OTEL_EXPORTER_OTLP_ENDPOINT` is set, completed spans are also POSTed as OTLP/HTTP JSON. See [ADR 0007](adr/0007-durable-execution.md)–[0011](adr/0011-gpu-inference.md).

## Nest DI note

Inject services with `@Inject(ServiceClass)` — plain constructor params can be undefined under `tsx` ESM.
