# ADR 0001: Three foundations first

## Status

Accepted

## Context

StudioOS aggregates many generative modalities. Products that bolt on cost tracking, lineage, and provider abstraction after launch typically rewrite half the stack.

## Decision

Ship three end-state systems from day one:

1. **Project Graph** — relational creative hierarchy + `asset_relations` lineage
2. **Model Hub + AI Gateway** — capability-oriented API; adapters isolated under `packages/providers`
3. **Usage Ledger** — immutable `usage_events` with `pricing_snapshots` and estimate/actual/variance

Feature modules (Cinema, Commercial, Music) sit on top of these.

## Consequences

- First vertical slice is slower to demo than a single-vendor toy app
- Adding Runway/Veo/etc. later is an adapter + pricing rule, not a product redesign
- Billing and continuity features can query history without log archaeology
