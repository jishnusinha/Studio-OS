import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import cookieParser from 'cookie-parser';
import { initTelemetry } from '@studio-os/observability';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';

async function bootstrap() {
  initTelemetry({ serviceName: 'studio-os-api' });

  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));

  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });
  app.use(cookieParser());

  const port = env.API_PORT ?? 4000;
  await app.listen(port);
  console.log(`StudioOS API listening on http://localhost:${port}`);
  console.log(`Collab WebSocket at ws://localhost:${port}/collab`);
}

bootstrap().catch((err) => {
  console.error('Failed to start API', err);
  process.exit(1);
});
