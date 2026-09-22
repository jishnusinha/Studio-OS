import { getStepHandler, runStep } from './registry.js';
import type { StepResult } from './types.js';

export interface GraphNode {
  key: string;
  type: string;
  label?: string;
  config?: Record<string, unknown>;
  fanOut?: boolean;
}

export interface GraphEdge {
  sourceKey: string;
  targetKey: string;
  /** When set, edge is taken only if condition matches step output */
  condition?: {
    field?: string;
    equals?: unknown;
    in?: unknown[];
    always?: boolean;
  };
  label?: string;
}

export interface WorkflowGraph {
  entry?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphStepRecord {
  nodeKey: string;
  stepType: string;
  status: StepResult['status'] | 'pending';
  fanOut: boolean;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
}

export interface GraphRunResult {
  status: 'completed' | 'failed';
  output: Record<string, unknown>;
  steps: GraphStepRecord[];
  error?: string;
}

function evalCondition(
  condition: GraphEdge['condition'] | undefined,
  output: Record<string, unknown>,
): boolean {
  if (!condition || condition.always) return true;
  const field = condition.field ?? 'route';
  const value = output[field];
  if (condition.equals !== undefined) return value === condition.equals;
  if (condition.in) return condition.in.includes(value);
  return true;
}

/**
 * Interpret a JSON workflow graph with conditional edges and fan-out.
 * Fan-out: when a node has fanOut=true (or multiple unconditional outgoing edges),
 * all matching targets run (sequentially here; marked fanOut on step records).
 */
export async function interpretGraph(
  graph: WorkflowGraph,
  input: Record<string, unknown> = {},
  opts?: { jobId?: string },
): Promise<GraphRunResult> {
  const nodeMap = new Map(graph.nodes.map((n) => [n.key, n]));
  const outgoing = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    const list = outgoing.get(e.sourceKey) ?? [];
    list.push(e);
    outgoing.set(e.sourceKey, list);
  }

  const entry =
    graph.entry ??
    graph.nodes.find((n) => !graph.edges.some((e) => e.targetKey === n.key))?.key ??
    graph.nodes[0]?.key;

  if (!entry || !nodeMap.has(entry)) {
    return { status: 'failed', output: {}, steps: [], error: 'Graph has no entry node' };
  }

  const steps: GraphStepRecord[] = [];
  let context: Record<string, unknown> = { ...input };
  const queue: string[] = [entry];
  const visited = new Set<string>();
  let failed = false;
  let lastError: string | undefined;

  while (queue.length > 0) {
    const key = queue.shift()!;
    if (visited.has(key)) continue;
    visited.add(key);

    const node = nodeMap.get(key);
    if (!node) continue;

    const handlerExists = Boolean(getStepHandler(node.type));
    const stepInput = { ...context, ...(node.config ?? {}) };
    const result = handlerExists
      ? await runStep(node.type, {
          jobId: opts?.jobId ?? 'graph-run',
          input: stepInput,
        })
      : await runStep('normalize', {
          jobId: opts?.jobId ?? 'graph-run',
          input: { ...stepInput, _unregisteredType: node.type },
        });

    const record: GraphStepRecord = {
      nodeKey: key,
      stepType: node.type,
      status: result.status,
      fanOut: Boolean(node.fanOut),
      input: stepInput,
      output: (result.output ?? {}) as Record<string, unknown>,
      error: result.error,
    };
    steps.push(record);

    if (result.status === 'failed') {
      failed = true;
      lastError = result.error ?? `Step ${key} failed`;
      break;
    }

    context = { ...context, ...record.output };

    const edges = (outgoing.get(key) ?? []).filter((e) => evalCondition(e.condition, record.output));
    const fanOut = Boolean(node.fanOut) || edges.length > 1;
    if (fanOut) {
      for (const e of edges) {
        const target = nodeMap.get(e.targetKey);
        if (target) {
          // Mark subsequent records conceptually as fan-out children
          target.fanOut = true;
        }
        if (!visited.has(e.targetKey)) queue.push(e.targetKey);
      }
    } else if (edges[0] && !visited.has(edges[0].targetKey)) {
      queue.push(edges[0].targetKey);
    }
  }

  return {
    status: failed ? 'failed' : 'completed',
    output: context,
    steps,
    error: lastError,
  };
}
