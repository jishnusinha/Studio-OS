import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createDb } from './client.js';
import {
  users,
  organizations,
  organizationMembers,
  workspaces,
  projects,
  projectMembers,
  providers,
  models,
  modelCapabilities,
  capabilities,
  pricingRules,
  creditBalances,
  scripts,
  scriptVersions,
  sequences,
  scenes,
  shots,
  characters,
  locations,
  lockedFacts,
  budgets,
  brands,
  products,
  campaignTemplates,
  campaigns,
  campaignBeats,
  campaignVariants,
  continuityConstraints,
  colorGrades,
  looks,
  multicamGroups,
  multicamAngles,
  datasets,
  fineTunes,
} from './schema/index.js';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://studio:studio@localhost:5432/studioos';

async function seed() {
  const db = createDb(connectionString);

  console.log('Seeding StudioOS...');

  // Capabilities
  const caps = [
    { id: 'text.generate', name: 'Text Generate', modality: 'text' },
    { id: 'text.embed', name: 'Text Embed', modality: 'text' },
    { id: 'image.generate', name: 'Image Generate', modality: 'image' },
    { id: 'image.edit', name: 'Image Edit', modality: 'image' },
    { id: 'image.upscale', name: 'Image Upscale', modality: 'image' },
    { id: 'video.generate', name: 'Video Generate', modality: 'video' },
    { id: 'video.edit', name: 'Video Edit', modality: 'video' },
    { id: 'video.upscale', name: 'Video Upscale', modality: 'video' },
    { id: 'video.color_grade', name: 'Video Color Grade', modality: 'video' },
    { id: 'video.matte', name: 'Video Matte', modality: 'video' },
    { id: 'voice.tts', name: 'Text to Speech', modality: 'voice' },
    { id: 'voice.stt', name: 'Speech to Text', modality: 'voice' },
    { id: 'music.generate', name: 'Music Generate', modality: 'music' },
    { id: 'music.midi', name: 'MIDI Generate', modality: 'music' },
    { id: 'sfx.generate', name: 'SFX Generate', modality: 'audio' },
    { id: 'audio.stem_split', name: 'Audio Stem Split', modality: 'audio' },
    { id: 'lip.sync', name: 'Lip Sync', modality: 'video' },
  ];
  for (const c of caps) {
    await db.insert(capabilities).values(c).onConflictDoNothing();
  }

  // Mock provider
  await db
    .insert(providers)
    .values({
      id: 'mock',
      name: 'Mock Provider',
      kind: 'mock',
      enabled: true,
      config: {},
    })
    .onConflictDoNothing();

  const mockModels = [
    {
      id: 'mock-llm',
      name: 'Mock LLM',
      caps: ['text.generate'],
      schema: {
        temperature: { type: 'number', minimum: 0, maximum: 2, default: 0.7 },
        max_tokens: { type: 'integer', minimum: 1, maximum: 8192, default: 1024 },
      },
    },
    {
      id: 'mock-image',
      name: 'Mock Image',
      caps: ['image.generate'],
      schema: {
        width: { type: 'integer', minimum: 256, maximum: 2048, default: 1024 },
        height: { type: 'integer', minimum: 256, maximum: 2048, default: 576 },
        seed: { type: 'integer', minimum: 0, maximum: 2147483647 },
      },
    },
    {
      id: 'mock-video',
      name: 'Mock Video',
      caps: ['video.generate'],
      schema: {
        duration: { type: 'number', minimum: 2, maximum: 10, default: 5 },
        aspect_ratio: { type: 'enum', values: ['16:9', '9:16', '1:1'], default: '16:9' },
        fps: { type: 'integer', minimum: 12, maximum: 60, default: 24 },
        seed: { type: 'integer', minimum: 0, maximum: 2147483647 },
      },
    },
    {
      id: 'mock-voice',
      name: 'Mock Voice',
      caps: ['voice.tts'],
      schema: {
        emotion: { type: 'enum', values: ['neutral', 'happy', 'sad', 'anxious'], default: 'neutral' },
        speed: { type: 'number', minimum: 0.5, maximum: 2, default: 1 },
      },
    },
    {
      id: 'mock-music',
      name: 'Mock Music',
      caps: ['music.generate'],
      schema: {
        duration: { type: 'number', minimum: 5, maximum: 120, default: 30 },
        bpm: { type: 'integer', minimum: 60, maximum: 180, default: 120 },
      },
    },
    {
      id: 'mock-embed',
      name: 'Mock Embeddings',
      caps: ['text.embed'],
      schema: {},
    },
    {
      id: 'mock-stems',
      name: 'Mock Stem Split',
      caps: ['audio.stem_split'],
      schema: {
        duration: { type: 'number', minimum: 1, maximum: 600, default: 30 },
      },
    },
    {
      id: 'mock-color',
      name: 'Mock Color Grade',
      caps: ['video.color_grade'],
      schema: {
        duration: { type: 'number', minimum: 0.1, maximum: 120, default: 4 },
        look: { type: 'enum', values: ['neutral', 'warm', 'cool', 'contrast'], default: 'neutral' },
      },
    },
    {
      id: 'mock-matte',
      name: 'Mock Matte',
      caps: ['video.matte'],
      schema: {
        width: { type: 'integer', minimum: 64, maximum: 4096, default: 512 },
        height: { type: 'integer', minimum: 64, maximum: 4096, default: 512 },
      },
    },
    {
      id: 'mock-midi',
      name: 'Mock MIDI',
      caps: ['music.midi'],
      schema: {
        duration: { type: 'number', minimum: 1, maximum: 240, default: 16 },
        bpm: { type: 'integer', minimum: 40, maximum: 240, default: 120 },
      },
    },
  ];

  for (const m of mockModels) {
    await db
      .insert(models)
      .values({
        id: m.id,
        providerId: 'mock',
        name: m.name,
        published: true,
        parameterSchema: m.schema,
      })
      .onConflictDoNothing();
    for (const cap of m.caps) {
      await db
        .insert(modelCapabilities)
        .values({ modelId: m.id, capabilityId: cap })
        .onConflictDoNothing();
    }
  }

  // Pricing
  const pricing = [
    { modelId: 'mock-llm', unit: 'input_token', rate: '0.0000002' },
    { modelId: 'mock-llm', unit: 'output_token', rate: '0.0000012' },
    { modelId: 'mock-image', unit: 'image', rate: '0.02' },
    { modelId: 'mock-video', unit: 'second', rate: '0.05' },
    { modelId: 'mock-voice', unit: 'character', rate: '0.00003' },
    { modelId: 'mock-music', unit: 'second', rate: '0.01' },
    { modelId: 'mock-embed', unit: 'input_token', rate: '0.00000002' },
    { modelId: 'mock-stems', unit: 'audio_minute', rate: '0.04' },
    { modelId: 'mock-color', unit: 'second', rate: '0.02' },
    { modelId: 'mock-matte', unit: 'generation', rate: '0.05' },
    { modelId: 'mock-midi', unit: 'second', rate: '0.005' },
  ];
  for (const p of pricing) {
    await db.insert(pricingRules).values({
      providerId: 'mock',
      modelId: p.modelId,
      unit: p.unit,
      rateUsd: p.rate,
      validFrom: new Date('2020-01-01'),
    });
  }

  // Demo user
  const passwordHash = await bcrypt.hash('studioos-demo', 10);
  const [existing] = await db.select().from(users).where(eq(users.email, 'demo@studioos.local'));
  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const [user] = await db
      .insert(users)
      .values({
        email: 'demo@studioos.local',
        passwordHash,
        name: 'Demo Director',
      })
      .returning();
    userId = user!.id;
  }

  let [org] = await db.select().from(organizations).where(eq(organizations.slug, 'demo-studio'));
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({ name: 'Demo Studio', slug: 'demo-studio' })
      .returning();
    await db.insert(organizationMembers).values({
      organizationId: org!.id,
      userId,
      role: 'owner',
    });
  }

  let [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, 'main'));
  if (!ws) {
    [ws] = await db
      .insert(workspaces)
      .values({ organizationId: org!.id, name: 'Main Workspace', slug: 'main' })
      .returning();
    await db.insert(creditBalances).values({ workspaceId: ws!.id, balanceUsd: '500' });
  }

  let [project] = await db.select().from(projects).where(eq(projects.slug, 'tape-discovery'));
  if (!project) {
    [project] = await db
      .insert(projects)
      .values({
        workspaceId: ws!.id,
        name: 'The Tape Discovery',
        slug: 'tape-discovery',
        type: 'cinema',
        description: 'A short thriller about Sarah discovering a mysterious tape.',
        budgetUsd: '500',
      })
      .returning();
    await db.insert(projectMembers).values({
      projectId: project!.id,
      userId,
      role: 'owner',
    });
    await db.insert(budgets).values({
      scopeType: 'project',
      scopeId: project!.id,
      limitUsd: '500',
      period: 'total',
      hardLimit: false,
      maxJobCostUsd: '25',
    });

    const [sarah] = await db
      .insert(characters)
      .values({
        projectId: project!.id,
        name: 'Sarah',
        bio: 'A wary journalist in her early 30s.',
        identity: { faceNotes: 'sharp features, dark hair' },
        wardrobe: { costume01: 'red leather jacket' },
        locked: true,
      })
      .returning();

    const [apartment] = await db
      .insert(locations)
      .values({
        projectId: project!.id,
        name: 'Apartment',
        description: 'Dimly lit city apartment at night',
        dna: { lighting: 'bedside lamp', palette: 'teal_amber_muted' },
        locked: true,
      })
      .returning();

    await db.insert(lockedFacts).values({
      projectId: project!.id,
      entityType: 'costume',
      entityId: sarah!.id,
      key: 'jacket',
      value: 'red leather from scenes 14–22',
      locked: true,
      sceneRange: '14-22',
    });

    const [script] = await db
      .insert(scripts)
      .values({
        projectId: project!.id,
        title: 'The Tape Discovery',
        format: 'fountain',
        status: 'ready',
      })
      .returning();

    await db.insert(scriptVersions).values({
      scriptId: script!.id,
      version: 1,
      content: `Title: The Tape Discovery
Author: Demo Director

INT. APARTMENT - NIGHT

Sarah discovers a mysterious tape on her desk.

SARAH
(whispering, frightened)
Don't open it.
`,
      storyBible: {
        premise: 'A journalist finds a tape that should not exist.',
        genre: 'thriller',
        tone: 'tense, nocturnal',
        themes: ['paranoia', 'truth'],
      },
    });

    const [seq] = await db
      .insert(sequences)
      .values({
        projectId: project!.id,
        scriptId: script!.id,
        number: 1,
        title: 'The Discovery',
        sortOrder: 0,
      })
      .returning();

    const [scene] = await db
      .insert(scenes)
      .values({
        projectId: project!.id,
        sequenceId: seq!.id,
        number: 17,
        slug: '17',
        heading: 'INT. APARTMENT — NIGHT',
        synopsis: 'Sarah discovers the tape.',
        emotion: 'Suspicion → fear → realization',
        durationTargetSec: 108,
        locationId: apartment!.id,
        status: 'ready',
        sortOrder: 0,
      })
      .returning();

    const shotDefs = [
      {
        code: '17A',
        desc: 'Wide establishing of apartment',
        dna: {
          shot: { size: 'wide', angle: 'eye_level' },
          camera: { lens: '35mm', motion: { type: 'dolly_in', intensity: 'subtle' } },
          environment: { time: 'night' },
          durationSec: 8,
          aspectRatio: '16:9',
        },
      },
      {
        code: '17B',
        desc: 'Close-up Sarah discovers tape',
        dna: {
          shot: { size: 'close_up', angle: 'eye_level' },
          camera: { lens: '85mm', motion: { type: 'static' } },
          subject: { emotion: 'anxious', action: 'discovers tape' },
          lighting: { key: 'soft tungsten', contrast: 'high', motivatedBy: 'bedside lamp' },
          look: { palette: 'teal_amber_muted', grain: '35mm_medium' },
          durationSec: 5,
          aspectRatio: '16:9',
        },
      },
      {
        code: '17C',
        desc: 'Handheld reaction',
        dna: {
          shot: { size: 'medium_close_up', angle: 'eye_level' },
          camera: { motion: { type: 'handheld', intensity: 'moderate' } },
          subject: { emotion: 'fear' },
          durationSec: 11,
          aspectRatio: '16:9',
        },
      },
      {
        code: '17D',
        desc: 'Macro insert of tape',
        dna: {
          shot: { size: 'extreme_close_up', angle: 'high' },
          camera: { lens: 'macro', motion: { type: 'static' } },
          durationSec: 4,
          aspectRatio: '16:9',
        },
      },
    ];

    for (let i = 0; i < shotDefs.length; i++) {
      const s = shotDefs[i]!;
      await db.insert(shots).values({
        projectId: project!.id,
        sceneId: scene!.id,
        code: s.code,
        description: s.desc,
        shotDna: s.dna,
        characterId: sarah!.id,
        durationSec: (s.dna as { durationSec?: number }).durationSec ?? 5,
        status: 'draft',
        sortOrder: i,
      });
    }
  }

  // Campaign templates (idempotent)
  const templateDefs = [
    {
      slug: 'product-hero',
      name: 'Product Hero',
      description: 'Hook → Product → Benefit → CTA',
      beats: [
        { type: 'HOOK', startSec: 0, endSec: 2 },
        { type: 'PRODUCT', startSec: 2, endSec: 8 },
        { type: 'BENEFIT', startSec: 8, endSec: 14 },
        { type: 'CTA', startSec: 14, endSec: 18 },
      ],
      defaultDurationSec: 18,
    },
    {
      slug: 'ugc-talking-head',
      name: 'UGC Talking Head',
      description: 'Authentic UGC beat grammar',
      beats: [
        { type: 'HOOK', startSec: 0, endSec: 2 },
        { type: 'PROBLEM', startSec: 2, endSec: 5 },
        { type: 'PRODUCT', startSec: 5, endSec: 10 },
        { type: 'PROOF', startSec: 10, endSec: 14 },
        { type: 'CTA', startSec: 14, endSec: 18 },
      ],
      defaultDurationSec: 18,
    },
    {
      slug: 'problem-solution',
      name: 'Problem / Solution',
      description: 'Classic problem-solution commercial',
      beats: [
        { type: 'HOOK', startSec: 0, endSec: 2 },
        { type: 'PROBLEM', startSec: 2, endSec: 5 },
        { type: 'PRODUCT', startSec: 5, endSec: 9 },
        { type: 'BENEFIT', startSec: 9, endSec: 13 },
        { type: 'PROOF', startSec: 13, endSec: 16 },
        { type: 'CTA', startSec: 16, endSec: 18 },
      ],
      defaultDurationSec: 18,
    },
  ];
  for (const t of templateDefs) {
    await db
      .insert(campaignTemplates)
      .values({
        slug: t.slug,
        name: t.name,
        description: t.description,
        beats: t.beats,
        defaultDurationSec: t.defaultDurationSec,
      })
      .onConflictDoNothing();
  }

  // Second demo: Commercial project
  let [commercial] = await db.select().from(projects).where(eq(projects.slug, 'aurora-bottle'));
  if (!commercial) {
    [commercial] = await db
      .insert(projects)
      .values({
        workspaceId: ws!.id,
        name: 'Aurora Bottle Launch',
        slug: 'aurora-bottle',
        type: 'commercial',
        description: 'Product Hero campaign for Aurora insulated bottle.',
        budgetUsd: '250',
      })
      .returning();
    await db.insert(projectMembers).values({
      projectId: commercial!.id,
      userId,
      role: 'owner',
    });
    await db.insert(budgets).values({
      scopeType: 'project',
      scopeId: commercial!.id,
      limitUsd: '250',
      period: 'total',
      hardLimit: false,
      maxJobCostUsd: '15',
      requireApprovalAboveUsd: '10',
    });

    const [brand] = await db
      .insert(brands)
      .values({
        projectId: commercial!.id,
        name: 'Aurora',
        dna: {
          logoUrl: null,
          colors: ['#0EA5E9', '#0F172A', '#F8FAFC'],
          fonts: ['Inter', 'Geist'],
          voice: 'confident, clean, outdoorsy',
          audience: 'active professionals 25-40',
          competitors: ['Hydro Flask', 'Yet'],
          cta: 'Stay cold. Stay moving.',
          approvedClaims: ['keeps drinks cold 24h', 'BPA-free'],
          forbiddenClaims: ['cures thirst permanently', 'FDA approved miracle'],
        },
        status: 'ready',
      })
      .returning();

    const [product] = await db
      .insert(products)
      .values({
        projectId: commercial!.id,
        brandId: brand!.id,
        name: 'Aurora Bottle 32oz',
        properties: {
          packshots: [],
          materials: 'stainless steel',
          colors: ['sky', 'slate', 'sand'],
        },
        status: 'ready',
      })
      .returning();

    const [tmpl] = await db
      .select()
      .from(campaignTemplates)
      .where(eq(campaignTemplates.slug, 'product-hero'))
      .limit(1);

    const [campaign] = await db
      .insert(campaigns)
      .values({
        projectId: commercial!.id,
        brandId: brand!.id,
        productId: product!.id,
        templateId: tmpl?.id ?? null,
        name: 'Aurora Product Hero — Master',
        status: 'draft',
        durationSec: 18,
        data: { master: true },
      })
      .returning();

    const beats = [
      { type: 'HOOK', label: 'Cold open', start: 0, end: 2, locked: false },
      { type: 'PRODUCT', label: 'Hero spin', start: 2, end: 8, locked: true },
      { type: 'BENEFIT', label: '24h cold', start: 8, end: 14, locked: true },
      { type: 'CTA', label: 'Stay moving', start: 14, end: 18, locked: false },
    ];
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i]!;
      await db.insert(campaignBeats).values({
        campaignId: campaign!.id,
        projectId: commercial!.id,
        beatType: b.type,
        label: b.label,
        startSec: b.start,
        endSec: b.end,
        prompt: `${b.label} for Aurora Bottle`,
        locked: b.locked,
        sortOrder: i,
        status: 'draft',
      });
    }

    // Seed one ready master cell + missing variant cells
    await db.insert(campaignVariants).values({
      campaignId: campaign!.id,
      projectId: commercial!.id,
      format: '16:9',
      language: 'en',
      durationSec: 18,
      status: 'ready',
      localization: { captions: true },
    });
    for (const fmt of ['9:16', '1:1'] as const) {
      for (const lang of ['en', 'es'] as const) {
        await db.insert(campaignVariants).values({
          campaignId: campaign!.id,
          projectId: commercial!.id,
          format: fmt,
          language: lang,
          durationSec: 15,
          status: 'missing',
          localization: {},
        });
      }
    }
  }

  // Third demo: Pro Studio lab (cinema) — continuity, color look, multicam, fine-tune placeholder
  let [proLab] = await db.select().from(projects).where(eq(projects.slug, 'pro-studio-lab'));
  if (!proLab) {
    [proLab] = await db
      .insert(projects)
      .values({
        workspaceId: ws!.id,
        name: 'Pro Studio Lab',
        slug: 'pro-studio-lab',
        type: 'cinema',
        description:
          'R3 Pro Studio sandbox: continuity constraints, color look, multicam group, fine-tune dataset.',
        budgetUsd: '750',
      })
      .returning();
    await db.insert(projectMembers).values({
      projectId: proLab!.id,
      userId,
      role: 'owner',
    });
    await db.insert(budgets).values({
      scopeType: 'project',
      scopeId: proLab!.id,
      limitUsd: '750',
      period: 'total',
      hardLimit: false,
      maxJobCostUsd: '40',
    });

    await db.insert(continuityConstraints).values({
      projectId: proLab!.id,
      entityType: 'costume',
      entityId: null,
      key: 'jacket',
      value: 'weathered olive field jacket',
      priority: 10,
      autoEnforce: true,
      sceneRange: '1-12',
      locked: true,
    });

    const [grade] = await db
      .insert(colorGrades)
      .values({
        projectId: proLab!.id,
        name: 'Lab Teal/Amber',
        nodeGraph: {
          nodes: [{ id: 'cdl', type: 'cdl', params: { saturation: 1.05 } }],
          edges: [],
        },
        version: 1,
        metadata: { seedLook: 'teal_amber_muted' },
      })
      .returning();

    await db.insert(looks).values({
      projectId: proLab!.id,
      name: 'Nocturnal Lab',
      gradeId: grade!.id,
      parameters: { palette: 'teal_amber_muted', grain: '35mm_medium' },
      metadata: { demo: true },
    });

    const [mcGroup] = await db
      .insert(multicamGroups)
      .values({
        projectId: proLab!.id,
        name: 'Interview A/B Stub',
        syncOffsetSec: 0,
        metadata: { demo: true, anglesPlanned: ['A', 'B'] },
      })
      .returning();

    await db.insert(multicamAngles).values([
      {
        groupId: mcGroup!.id,
        projectId: proLab!.id,
        name: 'Wide',
        label: 'A',
        sortOrder: 0,
        offsetSec: 0,
        metadata: { stub: true },
      },
      {
        groupId: mcGroup!.id,
        projectId: proLab!.id,
        name: 'Close',
        label: 'B',
        sortOrder: 1,
        offsetSec: 0.04,
        metadata: { stub: true },
      },
    ]);

    const [dataset] = await db
      .insert(datasets)
      .values({
        projectId: proLab!.id,
        name: 'Lab LoRA Placeholder',
        type: 'image_style',
        consent: { status: 'pending', note: 'demo placeholder — no real training data' },
        rights: { license: 'internal-demo' },
        version: 1,
      })
      .returning();

    await db.insert(fineTunes).values({
      projectId: proLab!.id,
      datasetId: dataset!.id,
      type: 'lora',
      config: { rank: 16, baseModel: 'mock-image', placeholder: true },
      status: 'draft',
      costEstimateUsd: '0',
      metrics: {},
      createdBy: userId,
    });
  }

  console.log('Seed complete.');
  console.log('  Demo login: demo@studioos.local / studioos-demo');
  console.log('  Cinema: The Tape Discovery');
  console.log('  Commercial: Aurora Bottle Launch');
  console.log('  Pro Studio: Pro Studio Lab (pro-studio-lab)');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
