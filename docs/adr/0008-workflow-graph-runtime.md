# ADR 0008: Workflow graph runtime

## Status

Accepted

## Context

Linear 13-step generation is insufficient for Pro Studio paths (budget gates, fan-out variants, conditional repairs). Product needs versioned JSON graphs stored per project with an interpreter that reuses the same step registry as the generation runner.

## Decision

- Persist definitions/runs in workflow tables (migration `0007_workflows.sql`).
- Expose `interpretGraph(graph, input)` from `@studio-os/workflow` with conditional edges and fan-out.
- Register built-in step handlers (`route`, `budget_check`, passthrough pipeline steps) at module load.
- Nest routes under `/projects/:id/workflows` and `/workflows/:id/runs` for CRUD + execution.

## Consequences

- Graph JSON is the authoring contract; Temporal activities wrap the same interpreter later.
- Unregistered node types fall back to `normalize` so drafts remain runnable.
- UI Workflow Builder consumes `GET /workflows/steps` for the palette.
