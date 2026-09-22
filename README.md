# StudioOS

**Creative Production Operating System** — from brief → research → script → visual development → shots → generation → voice/SFX/music → editing → delivery, with provider-agnostic models and tracked generation cost.

> Any model. One project. One creative memory. One timeline. One bill.

## Release status

| Release | Scope |
|---------|--------|
| **R1 Foundation** | Vertical Cinema slice, mock providers, Project Graph / Gateway / Ledger |
| **R2 Production** | Authorization, real mock media → MinIO, unified workers, billing correctness, Cinema depth, Commercial Studio, RAG, Creative Agent, surfaces |
| **R3 Pro Studio** *(current)* | Continuity Engine, Audio Lab, Music DAW, pro color, multicam, Stripe, C2PA-lite, Temporal-ready WorkflowEngine, workflow graphs, CRDT collab, self-hosted GPU seams, OTEL |

## Architecture foundations (non-negotiable)

1. **Project Graph** — stories, shots, assets, lineage, and dependency invalidation
2. **Model Hub + AI Gateway** — capability API; vendors never leak into product code
3. **Usage Ledger** — immutable estimate/actual/variance metering with pricing snapshots

## Stack

| Layer | Tech |
|-------|------|
| Web | Next.js + React + TypeScript + Tailwind |
| API | NestJS (TypeScript) |
| DB | PostgreSQL + pgvector (Drizzle ORM) |
| Cache / queues | Redis + BullMQ (`WorkflowEngine` → Temporal when `TEMPORAL_ADDRESS` is set) |
| Storage | MinIO / S3 |
| Media | FFmpeg via `@studio-os/media-synth` + media/render workers (compose installs ffmpeg) |
| Observability | In-memory tracer + optional OTLP (`OTEL_EXPORTER_OTLP_ENDPOINT`) |
| Providers | Mock adapters by default (real keys optional) |

## Monorepo layout

```text
apps/web                 Studio shell (Cinema + Commercial + Pro Studio)
apps/api                 NestJS REST + SSE + WebSocket collab + project/workspace guards
services/*-worker        generation / media / render
packages/contracts       Zod schemas
packages/db              Drizzle schema + migrate + seed
packages/providers       Adapter interface + mock/* + conformance + self-hosted
packages/media-synth     Deterministic playable mock media (ffmpeg/fallback)
packages/workflow        Shared generation runner + WorkflowEngine + interpretGraph
packages/script-parse    Fountain / FDX / PDF / DOCX parsers
packages/gateway         Router, estimator, prompt compiler
packages/billing         Pricing, ledger, budgets, Stripe/Mock BillingProvider
packages/timeline        Non-destructive command/undo engine + OTIO/EDL
packages/graph           Lineage + selective invalidation
packages/auth            Session JWT + RBAC
packages/observability   Tracer + optional OTLP export
packages/provenance      C2PA-lite sign/verify
packages/ui              Design system
infra/docker             Postgres, Redis, MinIO, workers (+ ffmpeg)
docs/adr                 Architecture decision records
```

## Quick start

### Prerequisites

- Node.js 22+
- pnpm 9 (`npm i -g pnpm@9.15.0`)
- Docker Desktop (Postgres / Redis / MinIO)
- Optional: ffmpeg on PATH for richer mock video/audio

### 1. Install

```bash
pnpm install
cp .env.example .env
```

### 2. Infrastructure

```bash
pnpm docker:up
```

### 3. Database

```bash
pnpm db:migrate
pnpm db:seed
```

Demo login: `demo@studioos.local` / `studioos-demo`

Seeded projects:

- **The Tape Discovery** (`tape-discovery`, Cinema) — Scene 17A–D
- **Aurora Bottle Launch** (`aurora-bottle`, Commercial) — Brand DNA + Product Hero + variant matrix
- **Pro Studio Lab** (`pro-studio-lab`, Cinema) — continuity constraints, color look, multicam stub, fine-tune dataset placeholder

### 4. Run

```bash
# API + web + workers
pnpm dev:all

# Or separately:
pnpm --filter @studio-os/api dev
pnpm --filter @studio-os/web dev
```

Open http://localhost:3000

### 5. Tests

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Cinema path (R2)

1. Log in → **The Tape Discovery**
2. Story extract → Story Bible / characters / locked facts
3. Director’s Board (Cards / Storyboard / Shot list / Status / Cost); `G`/`R`/`T`/`C`
4. Generate → store writes real bytes to MinIO → media-ingest proxies
5. NLE editor: trim/blade/ripple, undo/redo, generate-into-gap
6. Compare takes → choose selected; Lineage graph
7. Render → deliverable signed URL; OTIO/EDL export

## Commercial path (R2)

1. Open **Aurora Bottle Launch** → Commercial
2. Brand DNA (claims validator blocks forbidden copy)
3. Campaign from beat template (HOOK…CTA)
4. Variant Factory matrix → estimate → selective regenerate / localize

## Pro Studio path (R3)

1. Open **Pro Studio Lab** (`pro-studio-lab`)
2. Continuity run → scores / repairs on locked wardrobe & constraints
3. Audio Lab (stem split) / Music (MIDI) via Model Hub capabilities
4. Color grades & looks; multicam angle switching on the timeline
5. Workflow graph definitions → runs; optional Temporal via `TEMPORAL_ADDRESS`
6. Sign deliverables (C2PA-lite); Stripe when `STRIPE_SECRET_KEY` is set
7. Training datasets / fine-tune placeholders → self-hosted GPU adapters

## Intelligence

- Hierarchical RAG (384-dim hash/ONNX embedder, HNSW, hybrid RRF)
- Creative Agent tool-calling (`Ask Studio` + ⌘K entity search)
- Jobs SSE with cancel / retry / reprioritize
- Model Hub: Add → Test → Publish; GenerationPanel from `parameterSchema`

## ADRs

- [0001 Three foundations](docs/adr/0001-three-foundations.md)
- [0002 WorkflowEngine](docs/adr/0002-workflow-engine.md)
- [0003 Mock providers](docs/adr/0003-mock-providers.md)
- [0004 Media synthesis](docs/adr/0004-media-synthesis.md)
- [0005 Unified workflow](docs/adr/0005-unified-workflow.md)
- [0006 Authorization model](docs/adr/0006-authorization-model.md)
- [0007 Durable execution (Temporal)](docs/adr/0007-durable-execution.md)
- [0008 Workflow graph runtime](docs/adr/0008-workflow-graph-runtime.md)
- [0009 CRDT collaboration](docs/adr/0009-crdt-collaboration.md)
- [0010 Provenance C2PA](docs/adr/0010-provenance-c2pa.md)
- [0011 GPU inference](docs/adr/0011-gpu-inference.md)

## License

Proprietary — all rights reserved.
