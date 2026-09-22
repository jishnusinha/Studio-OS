# ADR 0006: Project / workspace authorization model

## Status

Accepted

## Context

Only the agent module checked `projectMembers` + RBAC. Projects, assets, story, generation, jobs, timeline, billing, and RAG accepted any logged-in user for any project ID (cross-tenant IDOR). `GET /jobs` returned all jobs globally.

## Decision

Lift the agent membership pattern into Nest guards:

- `ProjectAccessGuard` + `@ProjectScope({ from, name, via? })` resolves project id from params/body/query or via entity (`shot` | `timeline` | `asset` | `job` | `take` | `deliverable` | …).
- `WorkspaceAccessGuard` + `@WorkspaceScope` checks organization membership.
- `@RequireAction('read'|'write'|'generate'|…)` uses `can(role, action)` from `@studio-os/auth`.
- `GET /jobs` requires `?projectId=` (scoped) or lists only projects the caller belongs to.
- SSE `/projects/:id/jobs/stream` is project-scoped via the same guard.

Foreign project/entity IDs yield **403** (not a member) or **404** (missing).

## Consequences

- Every controller route that touches tenant data must declare scope metadata.
- RBAC is consistent with the agent tool permission model.
- Cross-tenant tests live in `apps/api/src/common/access.test.ts` and `tests/release2.test.ts`.
