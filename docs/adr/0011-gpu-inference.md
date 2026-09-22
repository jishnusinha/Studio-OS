# ADR 0011: GPU inference (self-hosted)

## Status

Accepted

## Context

Pro Studio fine-tunes and self-hosted video/image backends must run beside cloud providers without leaking vendor SDKs into product code. Operators need health, deployments, and Model Hub registration for private endpoints.

## Decision

- GPU / training schema seams (`datasets`, `fine_tunes`, `training_runs`, adapters, `gpu` tables).
- Provider registry supports `self-hosted` adapters (`createSelfHostedAdapter` / `registerSelfHostedProvider`) with capability routing identical to mock/cloud.
- Nest `/gpu` and `/projects/:id/training/*` routes manage datasets, runs, checkpoints, and adapter promotion into Model Hub ids.
- Cost estimates remain Usage Ledger events; self-hosted rates use pricing rules like any other provider.

## Consequences

- Mock adapters remain default; self-hosted activates via provider config + base URL.
- Fine-tune seed rows (e.g. `pro-studio-lab`) are placeholders until a real trainer worker lands.
- Temporal (ADR 0007) is the preferred orchestrator for long GPU jobs when available.
