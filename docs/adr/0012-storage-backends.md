# ADR 0012 — Storage backends (cloud S3 vs local filesystem)

## Status

Accepted

## Context

StudioOS needs two media modes:

1. **Cloud (`s3`)** — objects in MinIO/S3; signed URLs for upload/download.
2. **Local (`local`)** — same web + API stack on the machine; media files under `LOCAL_MEDIA_ROOT` on disk.

Editors, workers, and the project graph must not branch on vendor APIs. Preview uses proxies; masters remain the render source.

## Decision

- Introduce `@studio-os/storage` with a `StorageBackend` interface (`put`, `getStream`, `head`, `delete`, `materialize`, `presignPut`, `presignGet`).
- Implementations: `S3StorageBackend`, `LocalFsStorageBackend`.
- Select via `STORAGE_BACKEND=s3|local`.
- Preserve key layout: `projects/{projectId}/assets/{assetId}/…`.
- Local signed URLs are HMAC tokens served by `GET/PUT /media/local/*` on the API (prefer binding to localhost in production local mode).
- Render workers materialize keys to temp files (or use local paths directly when `localPath` is available).

## Consequences

- Local mode can run without MinIO.
- Cloud mode behavior stays compatible with existing MinIO compose.
- UI shows a Cloud/Local storage chip from `/system/storage`.
