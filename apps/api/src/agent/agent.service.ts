import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { can } from '@studio-os/auth';
import { checkBudget } from '@studio-os/billing';
import type { Env, ProjectRole } from '@studio-os/contracts';
import {
  assets,
  budgets,
  characters,
  projects,
  projectMembers,
  scenes,
  scripts,
  scriptVersions,
  shots,
  type Database,
} from '@studio-os/db';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { ENV } from '../config/env.js';
import { DB } from '../db/db.tokens.js';
import { GatewayFactory } from '../generation/gateway.factory.js';
import { GenerationService } from '../generation/generation.service.js';
import { RagService } from '../rag/rag.service.js';
import { TimelineService } from '../timeline/timeline.service.js';

const PreviewSchema = z.object({
  projectId: z.string().uuid(),
  message: z.string().min(1),
  selection: z
    .object({
      shotId: z.string().uuid().optional(),
      sceneId: z.string().uuid().optional(),
      timelineId: z.string().uuid().optional(),
    })
    .optional(),
});

const ExecuteSchema = z.object({
  confirmationToken: z.string().min(1),
});

export const AGENT_TOOLS = [
  'search_project',
  'read_script',
  'rewrite_scene',
  'create_shot',
  'plan_coverage',
  'generate_image',
  'generate_video',
  'edit_timeline',
  'make_variants',
  'calculate_cost',
  'explain_cost',
] as const;

export type ToolName = (typeof AGENT_TOOLS)[number];

interface PlannedToolCall {
  tool: ToolName;
  args: Record<string, unknown>;
  estimatedCostUsd: number;
  estimatedCostMaxUsd?: number;
}

export type { PlannedToolCall };

const TOOL_COST: Partial<Record<ToolName, { min: number; max: number }>> = {
  generate_image: { min: 0.01, max: 0.05 },
  generate_video: { min: 0.1, max: 0.4 },
  make_variants: { min: 0.05, max: 0.5 },
};

const TOOL_ACTION: Partial<Record<ToolName, Parameters<typeof can>[1]>> = {
  search_project: 'read',
  read_script: 'read',
  rewrite_scene: 'write',
  create_shot: 'write',
  plan_coverage: 'write',
  generate_image: 'generate',
  generate_video: 'generate',
  edit_timeline: 'write',
  make_variants: 'generate',
  calculate_cost: 'read',
  explain_cost: 'read',
};

const PLANNER_PROMPT = `You are StudioOS Creative Agent planner.
Return ONLY JSON of the form:
{"tool_calls":[{"name":"<tool>","args":{...}}],"summary":"<short plan>"}

Available tools:
- search_project { query }
- read_script {}
- rewrite_scene { sceneId?, instruction }
- create_shot { description, sceneId? }
- plan_coverage { sceneId?, shotCount? }
- generate_image { prompt, shotId? }
- generate_video { prompt, shotId?, durationSec? }
- edit_timeline { timelineId?, instruction }
- make_variants { campaignId?, formats?, languages? }
- calculate_cost { basedOn? }
- explain_cost { jobId? }

User message:
`;

function jsonFromLlm(text: string): unknown {
  const trimmed = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const raw = fence?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(raw.slice(start, end + 1));
  }
  return JSON.parse(raw);
}

function normalizeToolCalls(raw: unknown): PlannedToolCall[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as { tool_calls?: unknown[]; toolCalls?: unknown[] };
  const list = obj.tool_calls ?? obj.toolCalls ?? [];
  const out: PlannedToolCall[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { name?: string; tool?: string; args?: Record<string, unknown>; arguments?: Record<string, unknown> };
    const name = (row.name ?? row.tool) as ToolName | undefined;
    if (!name || !AGENT_TOOLS.includes(name)) continue;
    const costs = TOOL_COST[name];
    out.push({
      tool: name,
      args: row.args ?? row.arguments ?? {},
      estimatedCostUsd: costs?.min ?? 0,
      estimatedCostMaxUsd: costs?.max ?? costs?.min ?? 0,
    });
  }
  return out;
}

@Injectable()
export class AgentService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(GatewayFactory) private readonly gatewayFactory: GatewayFactory,
    @Inject(GenerationService) private readonly generation: GenerationService,
    @Inject(TimelineService) private readonly timelines: TimelineService,
    @Inject(RagService) private readonly rag: RagService,
  ) {}

  private async requireRole(projectId: string, userId: string): Promise<ProjectRole> {
    const [member] = await this.db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1);
    if (!member) throw new ForbiddenException('Not a project member');
    return member.role as ProjectRole;
  }

  /** Budget inheritance: project → workspace → organization. */
  private async resolveBudget(projectId: string, workspaceId: string) {
    const scopes: Array<{ scopeType: string; scopeId: string }> = [
      { scopeType: 'project', scopeId: projectId },
      { scopeType: 'workspace', scopeId: workspaceId },
    ];
    for (const s of scopes) {
      const [row] = await this.db
        .select()
        .from(budgets)
        .where(and(eq(budgets.scopeType, s.scopeType), eq(budgets.scopeId, s.scopeId)))
        .limit(1);
      if (row) {
        return {
          limitUsd: Number(row.limitUsd),
          spentUsd: Number(row.spentUsd),
          hardLimit: row.hardLimit,
          maxJobCostUsd: row.maxJobCostUsd != null ? Number(row.maxJobCostUsd) : null,
          requireApprovalAboveUsd:
            row.requireApprovalAboveUsd != null ? Number(row.requireApprovalAboveUsd) : null,
          scopeType: s.scopeType,
        };
      }
    }
    return null;
  }

  private assertToolPermission(role: ProjectRole, tool: ToolName) {
    const action = TOOL_ACTION[tool] ?? 'read';
    const resource =
      tool === 'edit_timeline'
        ? 'timeline'
        : tool === 'generate_image' || tool === 'generate_video' || tool === 'make_variants'
          ? 'generation'
          : 'project';
    if (!can(role, action, resource)) {
      throw new ForbiddenException(`Role ${role} cannot run ${tool}`);
    }
  }

  /**
   * Tool-calling loop over gateway text.generate.
   * Mock-llm returns tool_calls JSON for known intents; real models get the planner prompt.
   */
  private async planWithLlm(
    message: string,
    selection?: z.infer<typeof PreviewSchema>['selection'],
  ): Promise<{ plannedToolCalls: PlannedToolCall[]; summary: string }> {
    const gateway = this.gatewayFactory.get();
    const selectionHint = selection
      ? `\nSelection: ${JSON.stringify(selection)}`
      : '';
    let planned: PlannedToolCall[] = [];
    let summary = `Plan for: ${message.slice(0, 120)}`;
    let contextNotes = '';

    for (let turn = 0; turn < 3; turn++) {
      const llm = await gateway.execute({
        capability: 'text.generate',
        prompt: `${PLANNER_PROMPT}${message}${selectionHint}${contextNotes}\n\nTurn: ${turn + 1}`,
        parameters: {
          temperature: 0.2,
          max_tokens: 1024,
          agent_tools: true,
          user_message: message,
        },
        qualityMode: 'draft',
      });

      let parsed: unknown;
      try {
        parsed = jsonFromLlm(llm.text);
      } catch {
        break;
      }

      const calls = normalizeToolCalls(parsed);
      const obj = parsed as { summary?: string; needs_context?: string };
      if (obj.summary) summary = obj.summary;

      // If planner asks to search first, run tool and feed back (preview loop only for read tools)
      const needsSearch = calls.find((c) => c.tool === 'search_project' || c.tool === 'read_script');
      if (needsSearch && turn < 2 && calls.length === 1) {
        contextNotes += `\n[tool_result ${needsSearch.tool}] ran in planner context`;
        planned = calls;
        continue;
      }

      planned = calls.length ? calls : planned;
      break;
    }

    if (planned.length === 0) {
      planned = [
        {
          tool: 'search_project',
          args: { query: message.slice(0, 200) },
          estimatedCostUsd: 0,
          estimatedCostMaxUsd: 0,
        },
        {
          tool: 'calculate_cost',
          args: {},
          estimatedCostUsd: 0,
          estimatedCostMaxUsd: 0,
        },
      ];
    }

    // Always include cost tools when generation is planned
    const hasGen = planned.some((c) =>
      ['generate_image', 'generate_video', 'make_variants'].includes(c.tool),
    );
    if (hasGen && !planned.some((c) => c.tool === 'calculate_cost')) {
      planned.push({
        tool: 'calculate_cost',
        args: { basedOn: planned.map((c) => c.tool) },
        estimatedCostUsd: 0,
        estimatedCostMaxUsd: 0,
      });
    }

    return { plannedToolCalls: planned, summary };
  }

  async preview(userId: string, body: unknown) {
    const parsed = PreviewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const { projectId, message, selection } = parsed.data;
    const role = await this.requireRole(projectId, userId);
    if (!can(role, 'read', 'project')) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const [project] = await this.db
      .select({ id: projects.id, workspaceId: projects.workspaceId, name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw new BadRequestException('Project not found');

    const { plannedToolCalls, summary } = await this.planWithLlm(message, selection);

    for (const call of plannedToolCalls) {
      try {
        this.assertToolPermission(role, call.tool);
      } catch {
        // Drop forbidden tools from preview rather than failing entirely
        call.args = { ...call.args, _blocked: true };
      }
    }

    const allowedCalls = plannedToolCalls.filter((c) => !c.args._blocked);
    const estimatedCostMinUsd = allowedCalls.reduce((s, c) => s + c.estimatedCostUsd, 0);
    const estimatedCostMaxUsd = allowedCalls.reduce(
      (s, c) => s + (c.estimatedCostMaxUsd ?? c.estimatedCostUsd),
      0,
    );

    const budget = await this.resolveBudget(projectId, project.workspaceId);
    let budgetCheck: { allowed: boolean; reason?: string } = { allowed: true };
    if (budget) {
      const result = checkBudget(budget, estimatedCostMaxUsd);
      budgetCheck = { allowed: result.allowed, reason: result.reason };
    }

    const confirmationToken = await new SignJWT({
      projectId,
      userId,
      workspaceId: project.workspaceId,
      message,
      selection: selection ?? null,
      plannedToolCalls: allowedCalls,
      estimatedCostUsd: estimatedCostMinUsd,
      estimatedCostMaxUsd,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(this.env.JWT_SECRET));

    return {
      projectId,
      summary,
      estimatedCostUsd: estimatedCostMinUsd,
      estimatedCostMinUsd,
      estimatedCostMaxUsd,
      costRange: { minUsd: estimatedCostMinUsd, maxUsd: estimatedCostMaxUsd },
      plannedToolCalls: allowedCalls,
      confirmationToken,
      budget: budget
        ? {
            scopeType: budget.scopeType,
            limitUsd: budget.limitUsd,
            spentUsd: budget.spentUsd,
            check: budgetCheck,
          }
        : null,
      permissions: {
        role,
        canGenerate: can(role, 'generate', 'generation'),
        canWrite: can(role, 'write', 'project'),
      },
    };
  }

  async execute(userId: string, body: unknown) {
    const parsed = ExecuteSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    let payload: {
      projectId: string;
      userId: string;
      workspaceId: string;
      message: string;
      selection: { shotId?: string; sceneId?: string; timelineId?: string } | null;
      plannedToolCalls: PlannedToolCall[];
      estimatedCostUsd: number;
      estimatedCostMaxUsd?: number;
    };

    try {
      const { payload: raw } = await jwtVerify(
        parsed.data.confirmationToken,
        new TextEncoder().encode(this.env.JWT_SECRET),
      );
      payload = raw as unknown as typeof payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired confirmation token');
    }

    if (payload.userId !== userId) {
      throw new ForbiddenException('Token user mismatch');
    }

    const role = await this.requireRole(payload.projectId, userId);

    const budget = await this.resolveBudget(payload.projectId, payload.workspaceId);
    const proposed = payload.estimatedCostMaxUsd ?? payload.estimatedCostUsd;
    if (budget) {
      const result = checkBudget(budget, proposed);
      if (!result.allowed) {
        throw new ForbiddenException(result.reason ?? 'Budget exceeded');
      }
    }

    const results: Array<{ tool: ToolName; result: unknown }> = [];

    for (const call of payload.plannedToolCalls) {
      this.assertToolPermission(role, call.tool);
      const result = await this.runTool(userId, role, payload, call);
      results.push({ tool: call.tool, result });
    }

    return {
      projectId: payload.projectId,
      estimatedCostUsd: payload.estimatedCostUsd,
      estimatedCostMaxUsd: payload.estimatedCostMaxUsd,
      results,
    };
  }

  /** Project-wide entity search for ⌘K and search_project tool. */
  async searchProject(projectId: string, q: string) {
    const needle = q.trim();
    const pattern = needle ? `%${needle.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%` : '%';

    const [projectRows, sceneRows, shotRows, characterRows, assetRows] = await Promise.all([
      this.db
        .select({ id: projects.id, name: projects.name, type: projects.type })
        .from(projects)
        .where(and(eq(projects.id, projectId), ilike(projects.name, pattern)))
        .limit(5),
      this.db
        .select({
          id: scenes.id,
          heading: scenes.heading,
          number: scenes.number,
          synopsis: scenes.synopsis,
        })
        .from(scenes)
        .where(
          and(
            eq(scenes.projectId, projectId),
            or(ilike(scenes.heading, pattern), ilike(scenes.synopsis, pattern)),
          ),
        )
        .limit(20),
      this.db
        .select({
          id: shots.id,
          code: shots.code,
          description: shots.description,
          status: shots.status,
          sceneId: shots.sceneId,
        })
        .from(shots)
        .where(
          and(
            eq(shots.projectId, projectId),
            or(ilike(shots.code, pattern), ilike(shots.description, pattern)),
          ),
        )
        .limit(20),
      this.db
        .select({ id: characters.id, name: characters.name, bio: characters.bio })
        .from(characters)
        .where(and(eq(characters.projectId, projectId), ilike(characters.name, pattern)))
        .limit(20),
      this.db
        .select({
          id: assets.id,
          name: assets.name,
          type: assets.type,
          status: assets.status,
        })
        .from(assets)
        .where(
          and(
            eq(assets.projectId, projectId),
            or(ilike(assets.name, pattern), sql`${assets.type}::text ILIKE ${pattern}`),
          ),
        )
        .limit(20),
    ]);

    return {
      query: q,
      projects: projectRows.map((p) => ({ kind: 'project' as const, ...p })),
      scenes: sceneRows.map((s) => ({ kind: 'scene' as const, ...s, label: s.heading })),
      shots: shotRows.map((s) => ({
        kind: 'shot' as const,
        ...s,
        label: s.code,
      })),
      characters: characterRows.map((c) => ({ kind: 'character' as const, ...c, label: c.name })),
      assets: assetRows.map((a) => ({ kind: 'asset' as const, ...a, label: a.name })),
    };
  }

  private async runTool(
    userId: string,
    _role: ProjectRole,
    payload: {
      projectId: string;
      workspaceId: string;
      message: string;
      selection: { shotId?: string; sceneId?: string; timelineId?: string } | null;
    },
    call: PlannedToolCall,
  ): Promise<unknown> {
    switch (call.tool) {
      case 'search_project': {
        return this.searchProject(payload.projectId, String(call.args.query ?? payload.message));
      }
      case 'read_script': {
        const [script] = await this.db
          .select({ id: scripts.id, title: scripts.title })
          .from(scripts)
          .where(eq(scripts.projectId, payload.projectId))
          .orderBy(desc(scripts.createdAt))
          .limit(1);
        if (!script) return { script: null };
        const [version] = await this.db
          .select({
            version: scriptVersions.version,
            content: scriptVersions.content,
            storyBible: scriptVersions.storyBible,
          })
          .from(scriptVersions)
          .where(eq(scriptVersions.scriptId, script.id))
          .orderBy(desc(scriptVersions.version))
          .limit(1);
        // Scope RAG to project when reading script context
        const rag = await this.rag.query(payload.projectId, {
          query: payload.message.slice(0, 200),
          limit: 4,
          scope: 'project',
        });
        return {
          script: {
            id: script.id,
            title: script.title,
            version: version?.version,
            excerpt: (version?.content ?? '').slice(0, 2000),
            storyBible: version?.storyBible ?? {},
          },
          citations: rag.citations,
        };
      }
      case 'rewrite_scene': {
        const sceneId =
          (call.args.sceneId as string | undefined) ?? payload.selection?.sceneId;
        if (!sceneId) return { rewritten: false, reason: 'No scene selected' };
        const instruction = String(call.args.instruction ?? payload.message).slice(0, 1000);
        const [scene] = await this.db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
        if (!scene || scene.projectId !== payload.projectId) {
          return { rewritten: false, reason: 'Scene not found' };
        }
        const nextSynopsis = `${scene.synopsis ?? ''}\n\n[rewrite] ${instruction}`.trim().slice(0, 4000);
        const [updated] = await this.db
          .update(scenes)
          .set({ synopsis: nextSynopsis, updatedAt: new Date() })
          .where(eq(scenes.id, sceneId))
          .returning({
            id: scenes.id,
            heading: scenes.heading,
            synopsis: scenes.synopsis,
          });
        return { rewritten: true, scene: updated };
      }
      case 'create_shot': {
        let sceneId = (call.args.sceneId as string | undefined) ?? payload.selection?.sceneId;
        if (!sceneId) {
          const [scene] = await this.db
            .select({ id: scenes.id })
            .from(scenes)
            .where(eq(scenes.projectId, payload.projectId))
            .limit(1);
          sceneId = scene?.id;
        }
        if (!sceneId) return { created: false, reason: 'No scene available' };
        const existing = await this.db
          .select({ id: shots.id })
          .from(shots)
          .where(eq(shots.sceneId, sceneId));
        const [created] = await this.db
          .insert(shots)
          .values({
            projectId: payload.projectId,
            sceneId,
            code: `${existing.length + 1}A`,
            description: String(call.args.description ?? payload.message).slice(0, 500),
            sortOrder: existing.length,
          })
          .returning({
            id: shots.id,
            code: shots.code,
            description: shots.description,
          });
        return { created: true, shot: created };
      }
      case 'plan_coverage': {
        let sceneId = (call.args.sceneId as string | undefined) ?? payload.selection?.sceneId;
        if (!sceneId) {
          const [scene] = await this.db
            .select({ id: scenes.id })
            .from(scenes)
            .where(eq(scenes.projectId, payload.projectId))
            .limit(1);
          sceneId = scene?.id;
        }
        if (!sceneId) return { planned: false, reason: 'No scene available' };
        const count = Math.min(Number(call.args.shotCount ?? 3) || 3, 8);
        const sizes = ['WS', 'MS', 'CU', 'OTS', 'Insert'];
        const existing = await this.db
          .select({ id: shots.id })
          .from(shots)
          .where(eq(shots.sceneId, sceneId));
        const created = [];
        for (let i = 0; i < count; i++) {
          const [row] = await this.db
            .insert(shots)
            .values({
              projectId: payload.projectId,
              sceneId,
              code: `${existing.length + i + 1}${String.fromCharCode(65 + (i % 26))}`,
              description: `Coverage ${sizes[i % sizes.length]} — ${String(payload.message).slice(0, 120)}`,
              sortOrder: existing.length + i,
              shotDna: { shot: { size: sizes[i % sizes.length] } },
            })
            .returning({ id: shots.id, code: shots.code, description: shots.description });
          if (row) created.push(row);
        }
        return { planned: true, shots: created };
      }
      case 'generate_image':
      case 'generate_video': {
        const capability = call.tool === 'generate_image' ? 'image.generate' : 'video.generate';
        const job = await this.generation.generate(userId, {
          capability,
          intent: {
            prompt: String(call.args.prompt ?? payload.message),
            parameters: {},
            references: [],
          },
          constraints: {
            qualityMode: 'draft',
            takeCount: 1,
          },
          projectId: payload.projectId,
          workspaceId: payload.workspaceId,
          shotId: (call.args.shotId as string | undefined) ?? payload.selection?.shotId,
          parentAssetIds: [],
        });
        return { jobId: job.id, status: job.status, capability };
      }
      case 'edit_timeline': {
        const timelineId =
          (call.args.timelineId as string | undefined) ?? payload.selection?.timelineId;
        if (!timelineId) return { edited: false, reason: 'No timeline selected' };
        const result = await this.timelines.applyCommand(timelineId, {
          id: crypto.randomUUID(),
          type: 'add_marker',
          payload: {
            marker: {
              id: crypto.randomUUID(),
              time: 0,
              label: String(call.args.instruction ?? 'Agent edit').slice(0, 80),
            },
          },
          timestamp: Date.now(),
          source: 'ai',
        });
        return { edited: true, version: result.timeline.version, undoable: true };
      }
      case 'make_variants': {
        return {
          queued: true,
          formats: (call.args.formats as string[]) ?? ['16:9', '9:16', '1:1'],
          languages: (call.args.languages as string[]) ?? ['en'],
          campaignId: call.args.campaignId ?? null,
          note: 'Variant generation planned — open Commercial → Variants to execute matrix cells',
        };
      }
      case 'calculate_cost': {
        const gateway = this.gatewayFactory.get();
        const image = gateway.estimate({
          capability: 'image.generate',
          prompt: payload.message,
          qualityMode: 'draft',
        });
        const video = gateway.estimate({
          capability: 'video.generate',
          prompt: payload.message,
          parameters: { durationSec: 4 },
          qualityMode: 'draft',
        });
        return {
          imageEstimate: image,
          videoEstimate: video,
          range: {
            minUsd: Math.min(image.minUsd, video.minUsd),
            maxUsd: Math.max(image.maxUsd, video.maxUsd),
          },
        };
      }
      case 'explain_cost': {
        const gateway = this.gatewayFactory.get();
        const image = gateway.estimate({
          capability: 'image.generate',
          prompt: payload.message,
          qualityMode: 'draft',
        });
        return {
          explanation: `Draft image generation estimates $${image.minUsd.toFixed(3)}–$${image.maxUsd.toFixed(3)} on ${image.modelId}. Video is priced per second; variants multiply by format×language cells.`,
          breakdown: image.breakdown ?? [],
          modelId: image.modelId,
        };
      }
      default:
        return { ok: false };
    }
  }
}
