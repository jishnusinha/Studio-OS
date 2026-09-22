# ADR 0005: Unified `@studio-os/workflow` package

## Status

Accepted

## Context

Generation logic was duplicated between `apps/api` (in-process workflow) and `services/generation-worker`. The three workers were unreachable; API never enqueued BullMQ jobs. Drift was inevitable.

## Decision

Extract the 13 generation steps into `@studio-os/workflow`:

- `runGenerationWorkflow(jobId, deps)` is the single implementation.
- `WorkflowEngine` selects **BullMQ** when `REDIS_URL` is set, else **InProcess**.
- API and generation-worker both call the shared runner.
- Store step materializes bytes → PutObject → `asset_versions` → media-ingest enqueue.
- Meter step increments `projects.spentUsd` / `budgets.spentUsd` with usage events and sets 50/75/90/100 alert flags; `requireApprovalAboveUsd` parks jobs as `awaiting_approval`.

Compose runs `generation-worker`, `media-worker`, and `render-worker`; root `dev:all` starts them with the API/web.

## Consequences

- One source of truth for pipeline semantics.
- Local DX works without Redis; production uses queues.
- Temporal remains a future engine behind the same interface (see ADR 0002).
