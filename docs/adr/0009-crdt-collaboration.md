# ADR 0009: CRDT collaboration

## Status

Accepted

## Context

Pro Studio needs multiplayer presence, threaded comments, and conflict-tolerant document state (script notes, timeline markers) without blocking on a single writer. Classic OT is timeline-command specific; general docs need CRDTs.

## Decision

- Store CRDT documents and presence in collab tables (migration `0008_collab.sql`).
- REST for rooms / presence / docs / comments; WebSocket adapter at `/collab` for live fan-out.
- Timeline edits remain command/undo based (`TimelineEngine`); CRDT docs cover ancillary collaborative state (not the authoritative NLE command log).
- Client merges opaque CRDT payloads; server persists last snapshot + metadata (Yjs-compatible blob later).

## Consequences

- NLE truth stays event-sourced for undo/OTIO; CRDT is complementary.
- Presence is soft-state with heartbeat updates; rooms are project-scoped via existing access guards.
