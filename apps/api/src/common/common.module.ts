import { Global, Module } from '@nestjs/common';
import { ProjectAccessGuard, WorkspaceAccessGuard } from './access.guards.js';

@Global()
@Module({
  providers: [ProjectAccessGuard, WorkspaceAccessGuard],
  exports: [ProjectAccessGuard, WorkspaceAccessGuard],
})
export class CommonModule {}
