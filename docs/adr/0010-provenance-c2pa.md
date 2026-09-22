# ADR 0010: Provenance (C2PA-lite)

## Status

Accepted

## Context

Commercial and cinema deliverables need Content Credentials for AI-generated media. Full C2PA tooling is heavy for day-one DX; R3 needs sign/verify seams and API surfaces that can later embed real C2PA manifests.

## Decision

- Persist manifests, signatures, actions, and ingredients (`0009` provenance schema).
- Sign with **C2PA-lite**: RSA-SHA256 over claim JSON via `@studio-os/provenance` (`signC2paClaim` / `verifyC2paClaim`).
- Dev certs live under `.studioos/c2pa-dev-*.pem` (generated on first use).
- API: `POST /assets/:id/credentials/sign`, `GET /assets/:id/credentials`, deliverable embed endpoint.

## Consequences

- Not a substitute for certified C2PA validators yet; claim format is intentionally lite.
- Swapping to a full C2PA SDK should keep the same DB rows and API routes.
- See also Model Hub metadata for modelId/prompt assertions.
