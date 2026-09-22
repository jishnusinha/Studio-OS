export {
  MediaService,
  materializeMockUri,
  detectFfmpeg,
  detectFfprobe,
  resetFfmpegCache,
  type ProbeResult,
  type WaveformResult,
  type LoudnessResult,
  type MediaServiceOptions,
  type MaterializeResult,
} from './media-service.js';

export {
  processMediaJob,
  startWorker,
  tryStartWorker,
  MEDIA_INGEST_QUEUE,
  type MediaJobData,
  type MediaJobResult,
  type ProcessMediaJobOptions,
  type StartWorkerOptions,
} from './worker.js';
