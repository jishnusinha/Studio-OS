# ADR 0007: Durable execution (WorkflowEngine → Temporal)

## Status

Accepted

## Context

R1–R2 ship `InProcessWorkflowEngine` and `BullMQWorkflowEngine` behind a shared `WorkflowEngine` interface. Pro Studio generation graphs, approvals, and long-running GPU jobs need durable timers, signals, and multi-worker resume without reinventing orchestration on Redis alone.

## Decision

Keep `WorkflowEngine` as the product API (`enqueue` / `process` / optional `signal`). Prefer engines in this order:

1. **Temporal** when `TEMPORAL_ADDRESS` is set (`TemporalWorkflowEngine`)
2. **BullMQ** when `REDIS_URL` is set
3. **In-process** for local DX and unit tests

Generation activities remain mapped 1:1 to `generation_job_steps` so Temporal activities and BullMQ consumers share `runGenerationWorkflow`. Approval waits use `signal` (Temporal) or DB status `awaiting_approval` (BullMQ/in-process).

## Consequences

- Local developers need no Temporal cluster.
- Production can adopt Temporal Cloud/self-hosted without rewriting step logic.
- See ADR 0002 / 0005 for the historical BullMQ-first path.
