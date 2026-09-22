'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Panel, Spinner, CostChip, Button, Badge } from '@studio-os/ui';
import { authApi, projectsApi, billingApi, asNumber } from '@/lib/api';
import { useEffect, useState } from 'react';

export default function AdminUsagePage() {
  const qc = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [planCode, setPlanCode] = useState('starter');

  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => authApi.me(), retry: false });

  useEffect(() => {
    if (meQuery.data?.workspaces?.[0]?.id) setWorkspaceId(meQuery.data.workspaces[0].id);
  }, [meQuery.data]);

  const projectsQuery = useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: () => projectsApi.listByWorkspace(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  useEffect(() => {
    if (projectsQuery.data?.[0]?.id) setProjectId(projectsQuery.data[0].id);
  }, [projectsQuery.data]);

  const usageQuery = useQuery({
    queryKey: ['usage', projectId],
    queryFn: () => billingApi.projectUsage(projectId!),
    enabled: Boolean(projectId),
    retry: false,
  });

  const analyticsQuery = useQuery({
    queryKey: ['cost-analytics', projectId],
    queryFn: () => billingApi.costAnalytics(projectId!),
    enabled: Boolean(projectId),
    retry: false,
  });

  const workspaceBillingQuery = useQuery({
    queryKey: ['workspace-billing', workspaceId],
    queryFn: () => billingApi.workspaceBilling(workspaceId!),
    enabled: Boolean(workspaceId),
    retry: false,
  });

  const plansQuery = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => billingApi.listPlans(),
    retry: false,
  });

  const subscribeMutation = useMutation({
    mutationFn: () => billingApi.subscribeWorkspace(workspaceId!, { planCode }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workspace-billing', workspaceId] });
    },
  });

  const project = projectsQuery.data?.find((p) => p.id === projectId);
  const org = workspaceBillingQuery.data?.organization as
    | { subscription?: { status?: string; billingPlanId?: string } | null; provider?: string; stripeCustomerId?: string | null }
    | undefined;

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-cinema-border px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">Admin</div>
          <h1 className="text-[16px] font-semibold">Usage & billing</h1>
        </div>
        {project && (
          <CostChip amountUsd={asNumber(project.spentUsd)} budgetUsd={asNumber(project.budgetUsd) || null} />
        )}
      </div>

      <div className="p-4 space-y-4">
        {projectsQuery.data && projectsQuery.data.length > 0 && (
          <label className="flex flex-col gap-1 max-w-xs">
            <span className="text-[10px] uppercase tracking-[0.1em] text-cinema-muted font-semibold">Project</span>
            <select
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-9 rounded-md border border-cinema-border bg-cinema-bg px-2 text-[13px]"
            >
              {projectsQuery.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <Panel
          title="Subscription"
          subtitle={`Provider: ${plansQuery.data?.provider ?? workspaceBillingQuery.data?.billingProvider ?? '…'}`}
        >
          {workspaceBillingQuery.isLoading || plansQuery.isLoading ? (
            <Spinner label="Loading billing…" />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-[12px]">
                <Badge tone="neutral">
                  Customer: {org?.stripeCustomerId ?? 'none'}
                </Badge>
                <Badge tone={org?.subscription ? 'accent' : 'neutral'}>
                  {org?.subscription?.status ?? 'no subscription'}
                </Badge>
                <span className="text-cinema-muted">
                  Credits: $
                  {asNumber(
                    workspaceBillingQuery.data?.creditBalanceUsd as string | number | null | undefined,
                  ).toFixed(2)}
                </span>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.1em] text-cinema-muted font-semibold">Plan</span>
                  <select
                    value={planCode}
                    onChange={(e) => setPlanCode(e.target.value)}
                    className="h-9 rounded-md border border-cinema-border bg-cinema-bg px-2 text-[13px] min-w-[160px]"
                  >
                    {(plansQuery.data?.plans ?? []).map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name} · ${p.amountUsd}/{p.interval}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  disabled={!workspaceId || subscribeMutation.isPending}
                  onClick={() => subscribeMutation.mutate()}
                >
                  {subscribeMutation.isPending ? 'Subscribing…' : 'Subscribe'}
                </Button>
              </div>
              {subscribeMutation.error && (
                <p className="text-[12px] text-cinema-danger">
                  {(subscribeMutation.error as Error).message}
                </p>
              )}
              {subscribeMutation.isSuccess && (
                <p className="text-[12px] text-cinema-muted">Subscription updated.</p>
              )}
            </div>
          )}
        </Panel>

        {(usageQuery.isLoading || analyticsQuery.isLoading) && (
          <div className="py-10 flex justify-center">
            <Spinner label="Loading usage…" />
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-3">
          <Panel title="Project usage">
            {usageQuery.error ? (
              <p className="text-[12px] text-cinema-muted">{(usageQuery.error as Error).message}</p>
            ) : (
              <pre className="text-[11px] font-mono text-cinema-muted overflow-auto max-h-80">
                {JSON.stringify(usageQuery.data ?? {}, null, 2)}
              </pre>
            )}
          </Panel>
          <Panel title="Cost analytics">
            {analyticsQuery.error ? (
              <p className="text-[12px] text-cinema-muted">{(analyticsQuery.error as Error).message}</p>
            ) : (
              <pre className="text-[11px] font-mono text-cinema-muted overflow-auto max-h-80">
                {JSON.stringify(analyticsQuery.data ?? {}, null, 2)}
              </pre>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
