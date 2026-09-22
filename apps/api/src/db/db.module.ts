import { Global, Module } from '@nestjs/common';
import { createDb, type Database } from '@studio-os/db';
import type { Env } from '@studio-os/contracts';
import { ENV } from '../config/env.js';
import { DB } from './db.tokens.js';

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: (env: Env): Database => createDb(env.DATABASE_URL),
      inject: [ENV],
    },
  ],
  exports: [DB],
})
export class DbModule {}

export type { Database };
export { DB };
