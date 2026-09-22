import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  workflowDefinitions,
  workflowEdges,
  workflowNodes,
  workflowRunSteps,
  workflowRuns,
  type Database,
} from '@studio-os/db';
import { interpretGraph, listRegisteredSteps, type WorkflowGraph } from '@studio-os/workflow';
import { asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';

const NodeSchema = z.object({
  key: z.string().min(1).max(120),
  type: z.string().min(1).max(80),
  label: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  fanOut: z.boolean().optional(),
});

const EdgeSchema = z.object({
  sourceKey: z.string().min(1),
  targetKey: z.string().min(1),
  condition: z
    .object({
      field: z.string().optional(),
      equals: z.unknown().optional(),
      in: z.array(z.unknown()).optional(),
      always: z.boolean().optional(),
    })
    .optional(),
  label: z.string().optional(),
});

const CreateDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  entry: z.string().optional(),
  nodes: z.array(NodeSchema).min(1),
  edges: z.array(EdgeSchema).default([]),
  status: z.string().optional(),
});

const PatchDefinitionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  entry: z.string().optional(),
  nodes: z.array(NodeSchema).optional(),
  edges: z.array(EdgeSchema).optional(),
  status: z.string().optional(),
});

const StartRunSchema = z.object({
  input: z.record(z.unknown()).optional(),
});

@Injectable()
export class WorkflowsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  listStepTypes() {
    return { steps: listRegisteredSteps() };
  }

  async listDefinitions(projectId: string) {
    return this.db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.projectId, projectId))
      .orderBy(desc(workflowDefinitions.updatedAt));
  }

  async getDefinition(id: string) {
    const [def] = await this.db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, id))
      .limit(1);
    if (!def) throw new NotFoundException('Workflow definition not found');
    const [nodes, edges] = await Promise.all([
      this.db.select().from(workflowNodes).where(eq(workflowNodes.definitionId, id)),
      this.db.select().from(workflowEdges).where(eq(workflowEdges.definitionId, id)),
    ]);
    return { ...def, nodes, edges };
  }

  async createDefinition(projectId: string, body: unknown, userId?: string) {
    const parsed = CreateDefinitionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const data = parsed.data;
    const graph = {
      entry: data.entry ?? data.nodes[0]?.key,
      nodes: data.nodes.map((n) => ({
        key: n.key,
        type: n.type,
        label: n.label,
        config: n.config,
        fanOut: n.fanOut,
      })),
      edges: data.edges,
    };

    const [def] = await this.db
      .insert(workflowDefinitions)
      .values({
        projectId,
        name: data.name,
        description: data.description,
        status: data.status ?? 'draft',
        graph,
        createdBy: userId,
      })
      .returning();

    await this.replaceGraph(def!.id, data.nodes, data.edges);
    return this.getDefinition(def!.id);
  }

  async patchDefinition(id: string, body: unknown) {
    const parsed = PatchDefinitionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [existing] = await this.db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, id))
      .limit(1);
    if (!existing) throw new NotFoundException('Workflow definition not found');

    const data = parsed.data;
    let graph = existing.graph as Record<string, unknown>;
    if (data.nodes || data.edges || data.entry) {
      const nodes = data.nodes ?? ((graph.nodes as unknown[]) ?? []);
      const edges = data.edges ?? ((graph.edges as unknown[]) ?? []);
      graph = {
        entry: data.entry ?? (graph.entry as string | undefined),
        nodes,
        edges,
      };
      await this.replaceGraph(
        id,
        nodes as z.infer<typeof NodeSchema>[],
        edges as z.infer<typeof EdgeSchema>[],
      );
    }

    await this.db
      .update(workflowDefinitions)
      .set({
        name: data.name ?? existing.name,
        description: data.description === null ? null : (data.description ?? existing.description),
        status: data.status ?? existing.status,
        graph,
        updatedAt: new Date(),
      })
      .where(eq(workflowDefinitions.id, id));

    return this.getDefinition(id);
  }

  private async replaceGraph(
    definitionId: string,
    nodes: z.infer<typeof NodeSchema>[],
    edges: z.infer<typeof EdgeSchema>[],
  ) {
    await this.db.delete(workflowEdges).where(eq(workflowEdges.definitionId, definitionId));
    await this.db.delete(workflowNodes).where(eq(workflowNodes.definitionId, definitionId));
    if (nodes.length) {
      await this.db.insert(workflowNodes).values(
        nodes.map((n, i) => ({
          definitionId,
          key: n.key,
          type: n.type,
          label: n.label ?? n.type,
          config: (n.config ?? {}) as Record<string, unknown>,
          positionX: n.positionX ?? 40 + (i % 4) * 200,
          positionY: n.positionY ?? 40 + Math.floor(i / 4) * 90,
        })),
      );
    }
    if (edges.length) {
      await this.db.insert(workflowEdges).values(
        edges.map((e) => ({
          definitionId,
          sourceKey: e.sourceKey,
          targetKey: e.targetKey,
          condition: e.condition as Record<string, unknown> | undefined,
          label: e.label,
        })),
      );
    }
  }

  async startRun(definitionId: string, body: unknown, userId?: string) {
    const def = await this.getDefinition(definitionId);
    const parsed = StartRunSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const graph: WorkflowGraph = {
      entry: (def.graph as { entry?: string }).entry,
      nodes: def.nodes.map((n) => ({
        key: n.key,
        type: n.type,
        label: n.label ?? undefined,
        config: n.config as Record<string, unknown>,
        fanOut: Boolean((n.config as { fanOut?: boolean })?.fanOut),
      })),
      edges: def.edges.map((e) => ({
        sourceKey: e.sourceKey,
        targetKey: e.targetKey,
        condition: e.condition as WorkflowGraph['edges'][number]['condition'],
        label: e.label ?? undefined,
      })),
    };

    const [run] = await this.db
      .insert(workflowRuns)
      .values({
        projectId: def.projectId,
        definitionId: def.id,
        status: 'running',
        input: (parsed.data.input ?? {}) as Record<string, unknown>,
        startedBy: userId,
        startedAt: new Date(),
      })
      .returning();

    const result = await interpretGraph(graph, parsed.data.input ?? {}, { jobId: run!.id });

    if (result.steps.length) {
      await this.db.insert(workflowRunSteps).values(
        result.steps.map((s) => ({
          runId: run!.id,
          nodeKey: s.nodeKey,
          stepType: s.stepType,
          status: s.status,
          fanOut: s.fanOut,
          input: s.input,
          output: s.output,
          error: s.error,
          startedAt: new Date(),
          completedAt: new Date(),
        })),
      );
    }

    const [updated] = await this.db
      .update(workflowRuns)
      .set({
        status: result.status,
        output: result.output,
        error: result.error,
        completedAt: new Date(),
      })
      .where(eq(workflowRuns.id, run!.id))
      .returning();

    return this.getRun(updated!.id);
  }

  async listRuns(projectId: string, definitionId?: string) {
    const rows = await this.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.projectId, projectId))
      .orderBy(desc(workflowRuns.createdAt));
    if (definitionId) return rows.filter((r) => r.definitionId === definitionId);
    return rows;
  }

  async getRun(id: string) {
    const [run] = await this.db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).limit(1);
    if (!run) throw new NotFoundException('Workflow run not found');
    const steps = await this.db
      .select()
      .from(workflowRunSteps)
      .where(eq(workflowRunSteps.runId, id))
      .orderBy(asc(workflowRunSteps.startedAt));
    return { ...run, steps };
  }
}
