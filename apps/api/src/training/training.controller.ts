import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { TrainingService } from './training.service.js';

@Controller()
@UseGuards(AuthGuard)
export class TrainingController {
  constructor(@Inject(TrainingService) private readonly training: TrainingService) {}

  @Get('projects/:id/training/datasets')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listDatasets(@Param('id') projectId: string) {
    return this.training.listDatasets(projectId);
  }

  @Post('projects/:id/training/datasets')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createDataset(@Param('id') projectId: string, @Body() body: unknown) {
    return this.training.createDataset(projectId, body);
  }

  @Get('datasets/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'dataset' })
  getDataset(@Param('id') id: string) {
    return this.training.getDataset(id);
  }

  @Post('datasets/:id/items')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'dataset' })
  @RequireAction('write')
  addDatasetItem(@Param('id') id: string, @Body() body: unknown) {
    return this.training.addDatasetItem(id, body);
  }

  @Get('projects/:id/training/runs')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listRuns(@Param('id') projectId: string) {
    return this.training.listRuns(projectId);
  }

  @Get('projects/:id/training/fine-tunes')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listFineTunes(@Param('id') projectId: string) {
    return this.training.listFineTunes(projectId);
  }

  @Post('projects/:id/training/fine-tunes')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('generate')
  launchFineTune(
    @Param('id') projectId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    return this.training.launchFineTune(projectId, body, req.user?.id);
  }

  @Get('training-runs/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'trainingRun' })
  getRun(@Param('id') id: string) {
    return this.training.getRun(id);
  }

  @Post('training-runs/:id/metrics')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'trainingRun' })
  @RequireAction('write')
  appendMetrics(@Param('id') id: string, @Body() body: unknown) {
    return this.training.appendMetrics(id, body);
  }

  @Get('training-runs/:id/checkpoints')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'trainingRun' })
  listCheckpoints(@Param('id') id: string) {
    return this.training.listCheckpoints(id);
  }

  @Get('projects/:id/training/adapters')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listAdapters(@Param('id') projectId: string) {
    return this.training.listAdapters(projectId);
  }

  @Post('adapters/:id/promote')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'adapter' })
  @RequireAction('write')
  promoteAdapter(@Param('id') id: string, @Body() body: unknown) {
    return this.training.promoteAdapter(id, body);
  }
}
