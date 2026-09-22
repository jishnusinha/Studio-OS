# ADR 0004: Mock media synthesis (playable bytes without provider keys)

## Status

Accepted

## Context

Release 1 mock adapters returned only `mock://…` URI strings. The generation `store` step never downloaded bytes, MinIO stayed empty, and proxies/editor/renderer could not be verified. Without provider API keys we still need end-to-end media plumbing.

## Decision

Introduce `@studio-os/media-synth`:

- When **ffmpeg** is available: synthesize real H.264 MP4 (color field + burned-in label + tone), WAV/MP3 audio, and SVG/PNG stills from a deterministic seed.
- When ffmpeg is **absent** (CI/dev laptops): fall back to minimal valid containers / SVG / silent WAV so pipelines stay green.
- Mock adapters write artifacts under `os.tmpdir()/studioos-mock/` and return `file://` **and** `mock://` URIs.
- `materializeMockUri` is shared by the generation store step and media-worker.

Swapping in Runway/ElevenLabs later changes only the provider adapter — store → MinIO → proxy → NLE remains identical.

## Consequences

- Editor, Compare, and render workers exercise real bytes in local/dev.
- CI does not require ffmpeg, but production compose images should install it.
- Logical `mock://` ids remain for lineage/debug even when files exist.
