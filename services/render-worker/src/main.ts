import { startWorker } from './worker.js';

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log('[render-worker] REDIS_URL not set — exiting (use processRenderJob in-process)');
    process.exit(0);
  }

  const worker = startWorker({ redisUrl });

  const shutdown = async () => {
    console.log('[render-worker] shutting down…');
    await worker.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error('[render-worker] fatal:', err);
  process.exit(1);
});
