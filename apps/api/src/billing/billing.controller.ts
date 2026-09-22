import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import {
  ProjectAccessGuard,
  WorkspaceAccessGuard,
  ProjectScope,
  WorkspaceScope,
  RequireAction,
} from '../common/index.js';
import { BillingService } from './billing.service.js';

@Controller()
export class BillingController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Get('projects/:id/usage')
  @UseGuards(AuthGuard, ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  usage(@Param('id') projectId: string) {
    return this.billing.projectUsage(projectId);
  }

  @Get('workspaces/:id/billing')
  @UseGuards(AuthGuard, WorkspaceAccessGuard)
  @WorkspaceScope({ from: 'param', name: 'id' })
  workspaceBilling(@Param('id') workspaceId: string) {
    return this.billing.workspaceBilling(workspaceId);
  }

  @Get('projects/:id/cost-analytics')
  @UseGuards(AuthGuard, ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  analytics(@Param('id') projectId: string) {
    return this.billing.costAnalytics(projectId);
  }

  @Get('billing/plans')
  @UseGuards(AuthGuard)
  listPlans() {
    return this.billing.listPlans();
  }

  @Get('organizations/:id/billing')
  @UseGuards(AuthGuard)
  orgBilling(@Param('id') organizationId: string) {
    return this.billing.orgBillingSummary(organizationId);
  }

  @Post('organizations/:id/billing/subscribe')
  @UseGuards(AuthGuard)
  @RequireAction('billing')
  subscribeOrg(@Param('id') organizationId: string, @Body() body: unknown) {
    return this.billing.subscribeOrganization(organizationId, body);
  }

  @Post('workspaces/:id/billing/subscribe')
  @UseGuards(AuthGuard, WorkspaceAccessGuard)
  @WorkspaceScope({ from: 'param', name: 'id' })
  @RequireAction('billing')
  subscribeWorkspace(@Param('id') workspaceId: string, @Body() body: unknown) {
    return this.billing.subscribeWorkspace(workspaceId, body);
  }

  @Post('organizations/:id/billing/invoice')
  @UseGuards(AuthGuard)
  @RequireAction('billing')
  invoiceFromUsage(@Param('id') organizationId: string, @Body() body: unknown) {
    return this.billing.createInvoiceFromUsage(organizationId, body);
  }

  /** Stripe webhook stub — idempotent via stripe_events. No auth (signature checked when wired). */
  @Post('billing/webhooks/stripe')
  stripeWebhook(
    @Body() body: unknown,
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.billing.handleStripeWebhook(body, signature);
  }
}
