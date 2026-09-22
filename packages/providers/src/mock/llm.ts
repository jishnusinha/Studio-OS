import type { Capability } from '@studio-os/contracts';
import type { NormalizedRequest, ProviderAdapter, ProviderJob, ProviderJobStatus } from '../types.js';
import {
  createJobStore,
  emptyUsage,
  hashString,
  resolveSeed,
  toFileUri,
  writeStudioOsMockFile,
} from './util.js';

const store = createJobStore();

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function isStoryBibleTask(prompt: string): boolean {
  return /story[-_\s]?bible|TASK:\s*STORY_BIBLE|extract\s+(a\s+)?story\s+bible|logline.*themes.*characters/i.test(
    prompt,
  );
}

function scriptBodyFromPrompt(prompt: string): string {
  const markers = [
    /SCRIPT(?:\s*TEXT)?\s*:\s*([\s\S]+)$/i,
    /SOURCE(?:\s*TEXT)?\s*:\s*([\s\S]+)$/i,
    /CONTENT\s*:\s*([\s\S]+)$/i,
    /```(?:fountain|text|screenplay)?\s*([\s\S]*?)```/i,
  ];
  for (const re of markers) {
    const m = re.exec(prompt);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  // Strip the task preamble — use the longest paragraph block
  const parts = prompt.split(/\n{2,}/);
  return (parts[parts.length - 1] ?? prompt).trim();
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim();
    if (!key) continue;
    const lower = key.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(key);
  }
  return out;
}

/** Deterministic heuristic story-bible JSON from screenplay / idea text. */
export function buildMockStoryBibleJson(script: string): string {
  const text = script.trim() || 'An untitled story.';
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  const scenes: Array<{ heading: string; summary: string; characters: string[] }> = [];
  const characters = new Set<string>();
  const locations = new Set<string>();
  let current: (typeof scenes)[number] | null = null;
  const action: string[] = [];

  const flush = () => {
    if (!current || action.length === 0) return;
    const summary = action.join(' ').replace(/\s+/g, ' ').trim();
    if (summary) current.summary = current.summary ? `${current.summary} ${summary}` : summary;
    action.length = 0;
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (/^(INT|EXT|EST|I\/E|E\/I)[\.\s]/i.test(trimmed) || /^\.[A-Z]/.test(trimmed)) {
      flush();
      const heading = trimmed.replace(/^\./, '').trim();
      current = { heading, summary: '', characters: [] };
      scenes.push(current);
      const loc = heading
        .replace(/^(INT|EXT|EST|I\/E|E\/I)[\.\s]+/i, '')
        .replace(/\s+[-–—].*$/, '')
        .trim();
      if (loc) locations.add(loc);
      continue;
    }
    const cue = trimmed.replace(/\s*\(.*\)\s*$/, '').trim();
    if (
      /^[A-Z][A-Z0-9 \-'.]{1,40}$/.test(cue) &&
      !/^(INT|EXT|FADE|CUT|TITLE)/.test(cue) &&
      cue.split(/\s+/).length <= 4
    ) {
      flush();
      characters.add(cue);
      if (current && !current.characters.includes(cue)) current.characters.push(cue);
      continue;
    }
    if (current) action.push(trimmed);
  }
  flush();

  if (scenes.length === 0) {
    scenes.push({
      heading: 'INT. LOCATION - DAY',
      summary: text.slice(0, 280),
      characters: [],
    });
  }

  if (characters.size === 0) {
    characters.add('PROTAGONIST');
  }

  const genre =
    /noir|thriller|romance|comedy|drama|horror|sci-?fi|fantasy/i.exec(text)?.[0]?.toLowerCase() ??
    'drama';

  const themes = unique(
    [
      /identity/i.test(text) ? 'identity' : '',
      /family|mother|father|sister|brother/i.test(text) ? 'family' : '',
      /memory|remember|forget/i.test(text) ? 'memory' : '',
      /love|heart/i.test(text) ? 'love' : '',
      'consequence',
    ].filter(Boolean),
  );

  const props = unique(
    (text.match(/\b(?:letter|tape|key|photo|ring|gun|book|phone|watch)\b/gi) ?? []).map((p) =>
      p.toLowerCase(),
    ),
  );

  const logline =
    text.split(/\n/).find((l) => l.trim().length > 20)?.trim().slice(0, 240) ??
    text.slice(0, 240);

  const payload = {
    logline,
    themes,
    characters: [...characters].map((name) => ({
      name,
      description: `Extracted character ${name}`,
      traits: [genre === 'noir' ? 'world-weary' : 'grounded'],
    })),
    locations: [...locations],
    props,
    scenes: scenes.map((s) => ({
      heading: s.heading,
      summary: s.summary.slice(0, 400),
      characters: s.characters,
    })),
    lockedFacts: [
      {
        key: 'tone',
        value: genre === 'noir' ? 'moody, observational' : 'grounded realism',
      },
      ...(props[0]
        ? [{ key: `prop.${props[0]}`, value: `${props[0]} must remain continuous` }]
        : []),
    ],
  };

  return JSON.stringify(payload, null, 2);
}

function isAgentToolsTask(prompt: string, parameters?: Record<string, unknown>): boolean {
  return (
    parameters?.agent_tools === true ||
    /Creative Agent planner|Available tools:|tool_calls/i.test(prompt)
  );
}

function buildMockToolCallsJson(prompt: string): string {
  const userMatch =
    /User message:\s*([\s\S]*?)(?:\n\nTurn:|$)/i.exec(prompt) ??
    /user_message["']?\s*[:=]\s*["']?([^"'\n]+)/i.exec(prompt);
  const message = (userMatch?.[1] ?? prompt).trim();
  const lower = message.toLowerCase();
  const tool_calls: Array<{ name: string; args: Record<string, unknown> }> = [];

  tool_calls.push({ name: 'search_project', args: { query: message.slice(0, 200) } });

  if (/script|dialogue|read scene/i.test(lower)) {
    tool_calls.push({ name: 'read_script', args: {} });
  }
  if (/rewrite|revise scene|change dialogue/i.test(lower)) {
    tool_calls.push({ name: 'rewrite_scene', args: { instruction: message.slice(0, 400) } });
  }
  if (/coverage|master.?shot|plan shots/i.test(lower)) {
    tool_calls.push({ name: 'plan_coverage', args: { shotCount: 3 } });
  } else if (/shot|add beat|new shot/i.test(lower)) {
    tool_calls.push({ name: 'create_shot', args: { description: message.slice(0, 240) } });
  }
  if (/image|frame|still|keyframe/i.test(lower)) {
    tool_calls.push({ name: 'generate_image', args: { prompt: message } });
  }
  if (/video|clip|generate shot|animate/i.test(lower)) {
    tool_calls.push({ name: 'generate_video', args: { prompt: message, durationSec: 4 } });
  }
  if (/timeline|edit|cut|trim|marker/i.test(lower)) {
    tool_calls.push({ name: 'edit_timeline', args: { instruction: message } });
  }
  if (/variant|localize|reformat|9:16/i.test(lower)) {
    tool_calls.push({ name: 'make_variants', args: { formats: ['16:9', '9:16'] } });
  }
  if (/explain.?cost|why.*cost|breakdown/i.test(lower)) {
    tool_calls.push({ name: 'explain_cost', args: {} });
  } else {
    tool_calls.push({ name: 'calculate_cost', args: { basedOn: tool_calls.map((t) => t.name) } });
  }

  return JSON.stringify(
    {
      tool_calls,
      summary: `Plan for: ${message.slice(0, 120)}`,
    },
    null,
    2,
  );
}

function generateOutputText(req: NormalizedRequest, seed: number): string {
  if (isStoryBibleTask(req.prompt)) {
    return buildMockStoryBibleJson(scriptBodyFromPrompt(req.prompt));
  }
  if (isAgentToolsTask(req.prompt, req.parameters)) {
    return buildMockToolCallsJson(req.prompt);
  }
  const promptHash = hashString(`${seed}:${req.prompt}`);
  return `[mock-llm seed=${seed} hash=${promptHash.toString(16)}] ${req.prompt.slice(0, 200)}`;
}

export const mockLlmAdapter: ProviderAdapter = {
  id: 'mock-llm',
  capabilities: ['text.generate'] satisfies Capability[],

  async submit(req: NormalizedRequest): Promise<ProviderJob> {
    const seed = resolveSeed(req);
    const outputText = generateOutputText(req, seed);
    const inputTokens = estimateTokens(req.prompt);
    const outputTokens = estimateTokens(outputText);
    const mockUri = `mock://llm/${seed}.txt`;

    return store.submit(req, async () => {
      const path = await writeStudioOsMockFile(`llm-${seed}.txt`, Buffer.from(outputText, 'utf8'));
      return {
        outputUris: [toFileUri(path), mockUri],
        usage: emptyUsage({
          inputTokens,
          outputTokens,
          providerCostUsd: 0,
        }),
      };
    });
  },

  async poll(job: ProviderJob): Promise<ProviderJobStatus> {
    return store.poll(job);
  },

  async cancel(job: ProviderJob): Promise<void> {
    return store.cancel(job);
  },

  async reportedUsage(job: ProviderJob) {
    return store.reportedUsage(job);
  },
};
