# ADR 0003: Mock providers first

## Status

Accepted

## Context

Provider API keys may be unavailable during early development. The media pipeline, timeline, renderer, and ledger still need realistic end-to-end exercise.

## Decision

Ship `mock-*` adapters that:

- Are deterministic by seed
- Emit real filesystem artifacts via `mock://` URIs materialized by `MediaService`
- Report usage units consistent with `PricingRule` rows
- Pass `packages/providers` conformance tests

Real vendors implement the same `ProviderAdapter` interface and the same conformance suite.

## Consequences

- UI never depends on a specific vendor being online
- Cost estimates and ledger paths are tested continuously
- Conformance suite is the gate for every new adapter
