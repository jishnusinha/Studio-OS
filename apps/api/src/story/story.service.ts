import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  StoryBibleExtractionSchema,
  ShotDnaSchema,
  type LockedFact,
  type ShotDna,
  type StoryBible,
  type StoryBibleExtraction,
} from '@studio-os/contracts';
import {
  characters,
  locations,
  lockedFacts,
  scenes,
  scripts,
  scriptVersions,
  sequences,
  shots,
  styles,
  takes,
  type Database,
} from '@studio-os/db';
import { composeShotPromptContext } from '@studio-os/gateway';
import { parseScript, type ScriptFormat } from '@studio-os/script-parse';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';
import { GatewayFactory } from '../generation/gateway.factory.js';

const ExtractSchema = z
  .object({
    idea: z.string().optional(),
    content: z.string().optional(),
    contentBase64: z.string().optional(),
    filename: z.string().optional(),
    mimeType: z.string().optional(),
    format: z.enum(['fountain', 'fdx', 'pdf', 'docx', 'txt', 'unknown']).optional(),
    title: z.string().optional(),
  })
  .refine((v) => Boolean(v.idea?.trim() || v.content?.trim() || v.contentBase64?.trim()), {
    message: 'Provide idea, content, or contentBase64',
  });

const PatchShotSchema = z.object({
  shotDna: ShotDnaSchema.optional(),
  status: z.string().optional(),
  description: z.string().optional(),
});

const LockFactSchema = z.object({
  entityType: z.enum(['character', 'location', 'prop', 'costume', 'world', 'other']),
  entityId: z.string().uuid().optional(),
  key: z.string().min(1),
  value: z.string().min(1),
  sceneRange: z.string().optional(),
});

const CompileOverridesSchema = z
  .object({
    overrides: z.record(z.string()).optional(),
  })
  .passthrough();

const ReorderShotsSchema = z.object({
  shotIds: z.array(z.string().uuid()).min(1),
});

const PatchTakeSchema = z.object({
  rating: z.number().int().min(0).max(10).optional(),
  selected: z.boolean().optional(),
  status: z.string().optional(),
});

const STORY_BIBLE_TASK_PROMPT = `TASK: STORY_BIBLE
Extract a structured story bible from the source text below.
Respond with ONLY valid JSON matching this schema:
{
  "logline": string,
  "themes": string[],
  "characters": [{ "name": string, "description": string, "traits": string[] }],
  "locations": string[],
  "props": string[],
  "scenes": [{ "heading": string, "summary": string, "characters": string[] }],
  "lockedFacts": [{ "key": string, "value": string }]
}

SOURCE TEXT:
`;

function jsonFromLlmText(text: string): unknown {
  const trimmed = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }
  return JSON.parse(candidate);
}

@Injectable()
export class StoryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GatewayFactory) private readonly gatewayFactory: GatewayFactory,
  ) {}

  async getStory(projectId: string) {
    const [seqRows, sceneRows, shotRows, characterRows, locationRows, factRows] =
      await Promise.all([
        this.db
          .select()
          .from(sequences)
          .where(eq(sequences.projectId, projectId))
          .orderBy(asc(sequences.sortOrder)),
        this.db
          .select()
          .from(scenes)
          .where(eq(scenes.projectId, projectId))
          .orderBy(asc(scenes.sortOrder)),
        this.db
          .select()
          .from(shots)
          .where(eq(shots.projectId, projectId))
          .orderBy(asc(shots.sortOrder)),
        this.db.select().from(characters).where(eq(characters.projectId, projectId)),
        this.db.select().from(locations).where(eq(locations.projectId, projectId)),
        this.db.select().from(lockedFacts).where(eq(lockedFacts.projectId, projectId)),
      ]);

    return {
      sequences: seqRows,
      scenes: sceneRows,
      shots: shotRows,
      characters: characterRows,
      locations: locationRows,
      lockedFacts: factRows,
    };
  }

  async extract(projectId: string, body: unknown) {
    const parsed = ExtractSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const {
      idea,
      content,
      contentBase64,
      filename,
      mimeType,
      format: formatHint,
      title: titleHint,
    } = parsed.data;

    let sourceText = (content ?? idea ?? '').trim();
    let buffer: Buffer | undefined;
    if (contentBase64?.trim()) {
      buffer = Buffer.from(contentBase64, 'base64');
      if (!sourceText) {
        sourceText = buffer.toString('utf8');
      }
    }

    const format = (formatHint ?? 'unknown') as ScriptFormat;
    const parsedScript = parseScript({
      content: sourceText || undefined,
      buffer,
      filename,
      mimeType,
      format,
    });

    const scriptText = parsedScript.text.trim() || sourceText;
    if (!scriptText) {
      throw new BadRequestException('Empty script content');
    }

    const gateway = this.gatewayFactory.get();
    const llm = await gateway.execute({
      capability: 'text.generate',
      prompt: `${STORY_BIBLE_TASK_PROMPT}${scriptText}`,
      parameters: { temperature: 0.2, max_tokens: 4096 },
      qualityMode: 'draft',
    });

    let extraction: StoryBibleExtraction;
    try {
      const raw = jsonFromLlmText(llm.text);
      extraction = StoryBibleExtractionSchema.parse(raw);
    } catch (err) {
      throw new BadRequestException(
        `LLM story bible extraction returned invalid JSON: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // Fill gaps from deterministic script parse when LLM omits structure
    if (extraction.scenes.length === 0 && parsedScript.scenes.length > 0) {
      extraction = {
        ...extraction,
        scenes: parsedScript.scenes.map((s) => ({
          heading: s.heading,
          summary: s.summary,
          characters: s.characters,
        })),
      };
    }
    if (extraction.characters.length === 0 && parsedScript.characters.length > 0) {
      extraction = {
        ...extraction,
        characters: parsedScript.characters.map((name) => ({
          name,
          description: '',
          traits: [],
        })),
      };
    }
    if (extraction.locations.length === 0 && parsedScript.locations.length > 0) {
      extraction = { ...extraction, locations: parsedScript.locations };
    }
    if (!extraction.logline) {
      extraction = {
        ...extraction,
        logline: scriptText.slice(0, 240),
      };
    }

    const bible: StoryBible = {
      premise: extraction.logline,
      genre:
        /noir|thriller|romance|comedy|drama|horror|sci-?fi|fantasy/i.exec(scriptText)?.[0]?.toLowerCase() ??
        'drama',
      tone: 'grounded',
      themes: extraction.themes.length ? extraction.themes : ['identity', 'consequence'],
      visualLanguage: 'natural light, handheld intimacy',
      dialogueStyle: 'sparse, observational',
      worldRules: ['Stay emotionally truthful'],
      continuityConstraints: [
        'Preserve character wardrobe across scenes',
        ...extraction.lockedFacts.map((f) => `${f.key}: ${f.value}`),
      ],
    };

    const [script] = await this.db
      .insert(scripts)
      .values({
        projectId,
        title: titleHint ?? parsedScript.title ?? 'Extracted Story Bible',
        format: parsedScript.format === 'unknown' ? 'fountain' : parsedScript.format,
        status: 'draft',
      })
      .returning();

    if (!script) throw new BadRequestException('Failed to create script');

    await this.db.insert(scriptVersions).values({
      scriptId: script.id,
      version: 1,
      content: scriptText,
      storyBible: {
        ...bible,
        extraction,
        props: extraction.props,
      },
    });

    const characterRows = [];
    for (const ch of extraction.characters) {
      const [row] = await this.db
        .insert(characters)
        .values({
          projectId,
          name: ch.name,
          bio: ch.description || null,
          identity: {
            extracted: true,
            traits: ch.traits,
          },
          wardrobe: {},
          voiceProfile: {},
          acting: {},
          rights: { consent: false },
        })
        .returning();
      if (row) characterRows.push(row);
    }
    if (characterRows.length === 0) {
      const [row] = await this.db
        .insert(characters)
        .values({
          projectId,
          name: 'Protagonist',
          bio: extraction.logline.slice(0, 120),
          identity: { extracted: true, traits: [] },
          rights: { consent: false },
        })
        .returning();
      if (row) characterRows.push(row);
    }

    const locationRows = [];
    const locationNames =
      extraction.locations.length > 0 ? extraction.locations : ['Primary Location'];
    for (const name of locationNames) {
      const [row] = await this.db
        .insert(locations)
        .values({
          projectId,
          name,
          description: `Extracted location: ${name}`,
          dna: { extracted: true },
        })
        .returning();
      if (row) locationRows.push(row);
    }

    const factRows = [];
    for (const fact of extraction.lockedFacts) {
      const [row] = await this.db
        .insert(lockedFacts)
        .values({
          projectId,
          entityType: fact.entityType ?? 'world',
          key: fact.key,
          value: fact.value,
          locked: true,
        })
        .returning();
      if (row) factRows.push(row);
    }

    const [sequence] = await this.db
      .insert(sequences)
      .values({
        projectId,
        scriptId: script.id,
        number: 1,
        title: 'Act One',
        description: bible.premise,
        sortOrder: 0,
      })
      .returning();

    const sceneRows = [];
    const shotRows = [];
    const sceneInputs =
      extraction.scenes.length > 0
        ? extraction.scenes
        : [
            {
              heading: 'INT. LOCATION - DAY',
              summary: extraction.logline.slice(0, 280),
              characters: characterRows.map((c) => c.name),
            },
          ];

    for (let i = 0; i < sceneInputs.length; i++) {
      const sc = sceneInputs[i]!;
      const locName = locationFromHeading(sc.heading);
      const locationId =
        locationRows.find((l) => l.name.toLowerCase() === locName?.toLowerCase())?.id ??
        locationRows[0]?.id ??
        null;

      const charName = sc.characters[0];
      const characterId =
        characterRows.find((c) => c.name.toUpperCase() === charName?.toUpperCase())?.id ??
        characterRows[0]?.id ??
        null;

      const [scene] = await this.db
        .insert(scenes)
        .values({
          projectId,
          sequenceId: sequence!.id,
          number: i + 1,
          slug: String(i + 1),
          heading: sc.heading,
          synopsis: sc.summary || extraction.logline.slice(0, 280),
          locationId,
          sortOrder: i,
        })
        .returning();
      if (!scene) continue;
      sceneRows.push(scene);

      const [shot] = await this.db
        .insert(shots)
        .values({
          projectId,
          sceneId: scene.id,
          code: `${i + 1}A`,
          description: sc.summary || 'Opening beat',
          shotDna: {
            shot: { size: 'medium' },
            direction: (sc.summary || extraction.logline).slice(0, 200),
          },
          characterId,
          sortOrder: 0,
        })
        .returning();
      if (shot) shotRows.push(shot);
    }

    return {
      bible,
      extraction,
      script,
      characters: characterRows,
      locations: locationRows,
      lockedFacts: factRows,
      sequence,
      scenes: sceneRows,
      shots: shotRows,
      // backwards-compatible single entities
      character: characterRows[0] ?? null,
      location: locationRows[0] ?? null,
      scene: sceneRows[0] ?? null,
      shot: shotRows[0] ?? null,
    };
  }

  async reorderShots(projectId: string, body: unknown) {
    const parsed = ReorderShotsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const existing = await this.db
      .select({ id: shots.id })
      .from(shots)
      .where(and(eq(shots.projectId, projectId), inArray(shots.id, parsed.data.shotIds)));

    if (existing.length !== parsed.data.shotIds.length) {
      throw new BadRequestException('One or more shotIds do not belong to this project');
    }

    const updated = [];
    for (let i = 0; i < parsed.data.shotIds.length; i++) {
      const id = parsed.data.shotIds[i]!;
      const [row] = await this.db
        .update(shots)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(eq(shots.id, id))
        .returning();
      if (row) updated.push(row);
    }
    return updated;
  }

  async listTakes(shotId: string) {
    const [shot] = await this.db.select().from(shots).where(eq(shots.id, shotId)).limit(1);
    if (!shot) throw new NotFoundException('Shot not found');
    return this.db
      .select()
      .from(takes)
      .where(eq(takes.shotId, shotId))
      .orderBy(asc(takes.number));
  }

  async patchTake(takeId: string, body: unknown) {
    const parsed = PatchTakeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [existing] = await this.db.select().from(takes).where(eq(takes.id, takeId)).limit(1);
    if (!existing) throw new NotFoundException('Take not found');

    if (parsed.data.selected === true) {
      await this.db
        .update(takes)
        .set({ selected: false })
        .where(and(eq(takes.shotId, existing.shotId), eq(takes.selected, true)));
    }

    const [updated] = await this.db
      .update(takes)
      .set({
        ...(parsed.data.rating !== undefined ? { rating: parsed.data.rating } : {}),
        ...(parsed.data.selected !== undefined ? { selected: parsed.data.selected } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      })
      .where(eq(takes.id, takeId))
      .returning();

    return updated;
  }

  async patchShot(shotId: string, body: unknown) {
    const parsed = PatchShotSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const [existing] = await this.db.select().from(shots).where(eq(shots.id, shotId)).limit(1);
    if (!existing) throw new NotFoundException('Shot not found');

    const [updated] = await this.db
      .update(shots)
      .set({
        ...(parsed.data.shotDna
          ? { shotDna: parsed.data.shotDna as Record<string, unknown> }
          : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        updatedAt: new Date(),
        version: existing.version + 1,
      })
      .where(eq(shots.id, shotId))
      .returning();

    return updated;
  }

  async lockFact(shotId: string, body: unknown) {
    const parsed = LockFactSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const [shot] = await this.db.select().from(shots).where(eq(shots.id, shotId)).limit(1);
    if (!shot) throw new NotFoundException('Shot not found');

    const [fact] = await this.db
      .insert(lockedFacts)
      .values({
        projectId: shot.projectId,
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId ?? null,
        key: parsed.data.key,
        value: parsed.data.value,
        locked: true,
        sceneRange: parsed.data.sceneRange ?? null,
      })
      .returning();

    return fact;
  }

  async compilePrompt(shotId: string, body?: unknown) {
    const overridesParse = CompileOverridesSchema.safeParse(body ?? {});
    const overrides = overridesParse.success ? (overridesParse.data.overrides ?? {}) : {};

    const [shot] = await this.db.select().from(shots).where(eq(shots.id, shotId)).limit(1);
    if (!shot) throw new NotFoundException('Shot not found');

    const [scene] = await this.db
      .select()
      .from(scenes)
      .where(eq(scenes.id, shot.sceneId))
      .limit(1);

    const facts = await this.db
      .select()
      .from(lockedFacts)
      .where(and(eq(lockedFacts.projectId, shot.projectId), eq(lockedFacts.locked, true)));

    const conflictingKeys: string[] = [];
    for (const fact of facts) {
      if (Object.prototype.hasOwnProperty.call(overrides, fact.key)) {
        const overrideValue = overrides[fact.key];
        if (overrideValue !== fact.value) {
          conflictingKeys.push(fact.key);
        }
      }
    }
    if (conflictingKeys.length > 0) {
      throw new BadRequestException({
        message: 'Caller overrides conflict with locked facts',
        conflictingKeys,
      });
    }

    let characterRow =
      shot.characterId != null
        ? (
            await this.db
              .select()
              .from(characters)
              .where(eq(characters.id, shot.characterId))
              .limit(1)
          )[0]
        : undefined;

    if (!characterRow) {
      const [fallback] = await this.db
        .select()
        .from(characters)
        .where(eq(characters.projectId, shot.projectId))
        .limit(1);
      characterRow = fallback;
    }

    let locationRow: (typeof locations.$inferSelect) | undefined;
    if (scene?.locationId) {
      const [loc] = await this.db
        .select()
        .from(locations)
        .where(eq(locations.id, scene.locationId))
        .limit(1);
      locationRow = loc;
    }

    const [styleRow] = await this.db
      .select()
      .from(styles)
      .where(eq(styles.projectId, shot.projectId))
      .limit(1);

    const characterRows = await this.db
      .select({ name: characters.name })
      .from(characters)
      .where(eq(characters.projectId, shot.projectId));

    const [script] = await this.db
      .select()
      .from(scripts)
      .where(eq(scripts.projectId, shot.projectId))
      .orderBy(desc(scripts.createdAt))
      .limit(1);

    let bible: StoryBible | null = null;
    if (script) {
      const [version] = await this.db
        .select()
        .from(scriptVersions)
        .where(eq(scriptVersions.scriptId, script.id))
        .orderBy(desc(scriptVersions.version))
        .limit(1);
      if (version?.storyBible) {
        bible = version.storyBible as StoryBible;
      }
    }

    const locked: LockedFact[] = facts.map((f) => ({
      id: f.id,
      entityType: f.entityType as LockedFact['entityType'],
      entityId: f.entityId ?? undefined,
      key: f.key,
      value: f.value,
      locked: f.locked,
      sceneRange: f.sceneRange ?? undefined,
    }));

    const composed = composeShotPromptContext({
      shot: {
        description: shot.description,
        shotDna: shot.shotDna as ShotDna,
      },
      character: characterRow,
      location: locationRow,
      style: styleRow,
      bible,
      scene: scene ? { synopsis: scene.synopsis, heading: scene.heading } : null,
      characterNames: characterRows.map((c) => c.name),
      lockedFacts: locked,
      overrides,
    });

    return {
      compiledPrompt: composed.compiled.compiledPrompt,
      negativePrompt: composed.compiled.negativePrompt,
      layers: composed.layers,
      lockedFacts: composed.lockedFacts,
      context: composed.compiled.context,
    };
  }
}

function locationFromHeading(heading: string): string | undefined {
  const m = /^(?:INT|EXT|EST|I\/E|E\/I)[\.\s]+(.+?)(?:\s+[-–—]\s+|\s*$)/i.exec(heading.trim());
  return m?.[1]?.replace(/\s+[-–—].*$/, '').trim();
}
