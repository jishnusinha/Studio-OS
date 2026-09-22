import { createDefaultGateway, startWorker } from './worker.js';

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log(
      '[generation-worker] REDIS_URL not set — exiting (use runGenerationJob / InProcessWorkflowEngine)',
    );
    process.exit(0);
  }

  const gateway = createDefaultGateway();
  const worker = startWorker({
    redisUrl,
    gateway,
  });

  const shutdown = async () => {
    console.log('[generation-worker] shutting down…');
    await worker.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error('[generation-worker] fatal:', err);
  process.exit(1);
});
