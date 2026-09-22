# ADR 0002: WorkflowEngine interface (BullMQ now, Temporal later)

## Status

Accepted

## Context

Generation pipelines span provider calls, downloads, transcoding, embedding, and metering. Jobs must survive process restarts. Temporal is ideal but heavy for day-one local DX.

## Decision

Define `WorkflowEngine` with `enqueue` / `process`. Implement:

- `InProcessWorkflowEngine` for tests and simple API-inline runs
- `BullMQWorkflowEngine` for Redis-backed workers

Persist durable steps in `generation_job_steps` regardless of engine so a Temporal swap maps 1:1 to activities.

## Consequences

- No Temporal Cloud dependency for v1
- Workflow logic stays engine-agnostic
- Step table enables Generation Center UX and resume semantics
