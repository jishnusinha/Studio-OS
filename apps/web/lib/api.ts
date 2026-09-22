export const API_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) || 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export type ApiOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(path: string, query?: ApiOptions['query']): string {
  const base = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return base;
  const url = new URL(base);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, query, headers, ...rest } = options;
  const res = await fetch(buildUrl(path, query), {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const message =
      typeof parsed === 'object' && parsed && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status, parsed);
  }

  return parsed as T;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
}

export interface MeResponse {
  user: AuthUser;
  workspaces?: WorkspaceSummary[];
}

export interface ProjectDto {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  type: string;
  description?: string | null;
  budgetUsd?: number | string | null;
  spentUsd?: number | string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShotDto {
  id: string;
  projectId: string;
  sceneId: string;
  code: string;
  description?: string | null;
  shotDna?: Record<string, unknown>;
  characterId?: string | null;
  durationSec?: number | null;
  status?: string;
  sortOrder?: number;
  locked?: boolean;
}

export interface SceneDto {
  id: string;
  projectId: string;
  sequenceId?: string | null;
  number: number;
  slug: string;
  heading: string;
  synopsis?: string | null;
  emotion?: string | null;
  durationTargetSec?: number | null;
  locationId?: string | null;
  status?: string;
  sortOrder?: number;
}

export interface SequenceDto {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description?: string | null;
  status?: string;
  sortOrder?: number;
}

export interface CharacterDto {
  id: string;
  name: string;
  bio?: string | null;
  locked?: boolean;
}

export interface LocationDto {
  id: string;
  name: string;
  description?: string | null;
  locked?: boolean;
}

export interface LockedFactDto {
  id: string;
  entityType: string;
  entityId?: string | null;
  key: string;
  value: string;
  locked?: boolean;
  sceneRange?: string | null;
}

export interface StoryPayload {
  sequences: SequenceDto[];
  scenes: SceneDto[];
  shots: ShotDto[];
  characters: CharacterDto[];
  locations: LocationDto[];
  lockedFacts: LockedFactDto[];
  script?: { id: string; title: string; content?: string; storyBible?: Record<string, unknown> } | null;
}

export interface CostEstimateDto {
  minUsd: number;
  maxUsd: number;
  currency?: string;
  modelId: string;
  providerId: string;
  etaSec?: { min: number; max: number };
  breakdown?: Array<{ unit: string; quantity: number; rate: number; amountUsd: number }>;
}

export interface GenerationJobDto {
  id: string;
  projectId: string;
  capability: string;
  status: string;
  progress: number;
  priority?: number;
  estimatedCostUsd?: number | null;
  actualCostUsd?: number | null;
  modelId?: string | null;
  providerId?: string | null;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  shotId?: string | null;
}

export interface ModelDto {
  id: string;
  name: string;
  providerId?: string;
  parameterSchema?: Record<string, unknown>;
  capabilities?: string[];
  published?: boolean;
}

export const authApi = {
  login: (email: string, password: string) =>
    api<{ user: AuthUser }>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => api('/auth/logout', { method: 'POST' }),
  me: () => api<MeResponse>('/auth/me'),
};

export interface ProjectSearchHit {
  id: string;
  kind?: string;
  label?: string;
  name?: string;
  heading?: string;
  code?: string;
  number?: number;
  description?: string | null;
  synopsis?: string | null;
  type?: string;
  status?: string;
  bio?: string | null;
}

export interface ProjectSearchResult {
  query: string;
  projects: ProjectSearchHit[];
  scenes: ProjectSearchHit[];
  shots: ProjectSearchHit[];
  characters: ProjectSearchHit[];
  assets: ProjectSearchHit[];
}

export const projectsApi = {
  listByWorkspace: (workspaceId: string) =>
    api<{ projects: ProjectDto[] } | ProjectDto[]>(`/workspaces/${workspaceId}/projects`).then((r) =>
      Array.isArray(r) ? r : r.projects,
    ),
  get: (id: string) => api<ProjectDto>(`/projects/${id}`),
  search: (id: string, q: string) =>
    api<ProjectSearchResult>(`/projects/${id}/search`, { query: { q } }),
};

export const storyApi = {
  get: (projectId: string) => api<StoryPayload>(`/projects/${projectId}/story`),
  patchShot: (shotId: string, body: Partial<Pick<ShotDto, 'shotDna' | 'status' | 'description'>>) =>
    api<ShotDto>(`/shots/${shotId}`, { method: 'PATCH', body }),
  reorderShots: (projectId: string, orderedIds: string[]) =>
    api<ShotDto[]>(`/projects/${projectId}/shots/reorder`, {
      method: 'POST',
      body: { orderedIds },
    }),
  listTakes: (shotId: string) =>
    api<{ shot: ShotDto; takes: TakeDto[] }>(`/shots/${shotId}/takes`),
  patchTake: (
    takeId: string,
    body: Partial<Pick<TakeDto, 'rating' | 'selected' | 'status'>>,
  ) => api<TakeDto>(`/takes/${takeId}`, { method: 'PATCH', body }),
};

export interface TakeDto {
  id: string;
  shotId: string;
  number: number;
  assetId?: string | null;
  rating?: number | null;
  selected?: boolean;
  status?: string;
  modelId?: string | null;
  providerId?: string | null;
  costUsd?: number | null;
  seed?: number | null;
  promptCompiled?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface TimelineDto {
  id: string;
  projectId: string;
  name: string;
  fps: number;
  width: number;
  height: number;
  duration: number;
  version: number;
  tracks: Array<{
    id: string;
    type: string;
    name: string;
    muted: boolean;
    locked: boolean;
    solo: boolean;
    height: number;
    clips: Array<{
      id: string;
      assetId: string;
      sourceIn: number;
      sourceOut: number;
      timelineStart: number;
      speed: number;
      label?: string;
      muted?: boolean;
      linkedAudioClipId?: string | null;
      transform?: Record<string, number>;
      effects?: unknown[];
      keyframes?: unknown[];
    }>;
  }>;
  markers: Array<{ id: string; time: number; label: string; color?: string }>;
}

export interface TimelineCommandDto {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  source?: 'user' | 'ai' | 'system';
}

export interface LineageNodeDto {
  id: string;
  label: string;
  kind: string;
  type?: string;
  status?: string;
  stale?: boolean;
  inspect?: {
    prompt?: string | null;
    model?: string | null;
    seed?: number | null;
    costUsd?: number | null;
    providerId?: string | null;
    takeId?: string | null;
    takeNumber?: number | null;
  };
}

export interface LineageEdgeDto {
  from: string;
  to: string;
  relationType: string;
  stale?: boolean;
}

export interface LineagePayload {
  assetId: string;
  nodes: LineageNodeDto[];
  edges: LineageEdgeDto[];
  ancestors: string[];
  descendants: string[];
  staleDependents: string[];
  suggestedActions: Array<{ type: string; assetId: string }>;
}

export const timelinesApi = {
  list: (projectId: string) => api<unknown[]>(`/projects/${projectId}/timelines`),
  create: (projectId: string, body: { name: string; fps?: number; width?: number; height?: number }) =>
    api<unknown>(`/projects/${projectId}/timelines`, { method: 'POST', body }),
  get: (id: string) =>
    api<{ timeline: TimelineDto; canUndo?: boolean; canRedo?: boolean }>(`/timelines/${id}`),
  command: (id: string, body: TimelineCommandDto) =>
    api<{ timeline: TimelineDto; canUndo?: boolean; canRedo?: boolean }>(`/timelines/${id}/commands`, {
      method: 'POST',
      body,
    }),
  undo: (id: string) =>
    api<{ timeline: TimelineDto; undone?: boolean; canUndo?: boolean; canRedo?: boolean }>(
      `/timelines/${id}/undo`,
      { method: 'POST' },
    ),
  redo: (id: string) =>
    api<{ timeline: TimelineDto; redone?: boolean; canUndo?: boolean; canRedo?: boolean }>(
      `/timelines/${id}/redo`,
      { method: 'POST' },
    ),
  render: (id: string, body?: { name?: string; preset?: string }) =>
    api<{ id: string; status: string; preset: string }>(`/timelines/${id}/render`, {
      method: 'POST',
      body: body ?? {},
    }),
  generateGap: (id: string, trackId: string, body?: { gapIndex?: number; prompt?: string }) =>
    api<Record<string, unknown>>(`/timelines/${id}/gaps/${trackId}/generate`, {
      method: 'POST',
      body: body ?? {},
    }),
  previewUrl: (id: string, t: number, w = 960) => {
    const base =
      (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) || 'http://localhost:4000';
    return `${base}/timelines/${id}/preview?t=${encodeURIComponent(String(t))}&w=${w}`;
  },
};

export const assetsApi = {
  list: (projectId: string, query?: Record<string, string | number | undefined>) =>
    api<AssetDto[]>(`/projects/${projectId}/assets`, { query }),
  get: (assetId: string) => api<AssetDto>(`/assets/${assetId}`),
  signedUrl: (assetId: string, variant = 'proxy') =>
    api<{ url: string; variant: string }>(`/assets/${assetId}/url`, { query: { variant } }),
  lineage: (assetId: string) => api<LineagePayload>(`/assets/${assetId}/lineage`),
  updateStale: (assetId: string) =>
    api<Record<string, unknown>>(`/assets/${assetId}/lineage/update-stale`, { method: 'POST' }),
  presign: (body: {
    projectId: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    assetType: 'image' | 'video' | 'audio' | 'document' | 'script' | 'other';
  }) =>
    api<{
      assetId: string;
      uploadUrl: string;
      key: string;
      expiresAt: string;
      directPut?: boolean;
      storageBackend?: string;
    }>('/assets/presign', { method: 'POST', body }),
  complete: (assetId: string) => api<AssetDto>(`/assets/${assetId}/complete`, { method: 'POST' }),
  uploadFile: async (
    projectId: string,
    file: File,
    assetType: 'image' | 'video' | 'audio' | 'document' | 'script' | 'other' = 'video',
  ) => {
    const signed = await assetsApi.presign({
      projectId,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      assetType,
    });
    const put = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    return assetsApi.complete(signed.assetId);
  },
};

export const systemApi = {
  storage: () =>
    api<{ backend: 's3' | 'local'; label: string; localMediaRoot: string | null; s3Bucket: string | null }>(
      '/system/storage',
    ),
};

export const deliverablesApi = {
  signedUrl: (id: string) =>
    api<{ url: string; status: string; preset: string; storageKey: string }>(
      `/deliverables/${id}/url`,
    ),
};

export const generationApi = {
  estimate: (body: unknown) => api<CostEstimateDto>('/generate/estimate', { method: 'POST', body }),
  generate: (body: unknown) => api<{ job: GenerationJobDto } | GenerationJobDto>('/generate', { method: 'POST', body }),
};

export const jobsApi = {
  list: (query?: { projectId?: string }) =>
    api<{ jobs: GenerationJobDto[] } | GenerationJobDto[]>('/jobs', { query }).then((r) =>
      Array.isArray(r) ? r : r.jobs,
    ),
  get: (id: string) => api<GenerationJobDto>(`/jobs/${id}`),
  cancel: (id: string) => api(`/jobs/${id}/cancel`, { method: 'POST' }),
  retry: (id: string) => api<GenerationJobDto>(`/jobs/${id}/retry`, { method: 'POST' }),
  reprioritize: (id: string, priority: number) =>
    api<GenerationJobDto>(`/jobs/${id}/reprioritize`, { method: 'POST', body: { priority } }),
  streamUrl: (projectId: string) => `${API_URL}/projects/${projectId}/jobs/stream`,
};

export interface AgentPreviewDto {
  projectId: string;
  summary: string;
  estimatedCostUsd: number;
  estimatedCostMinUsd?: number;
  estimatedCostMaxUsd?: number;
  costRange?: { minUsd: number; maxUsd: number };
  plannedToolCalls: Array<{ tool: string; args: Record<string, unknown>; estimatedCostUsd: number }>;
  confirmationToken: string;
  permissions?: { role: string; canGenerate?: boolean; canWrite?: boolean };
}

export const agentApi = {
  preview: (body: {
    projectId: string;
    message: string;
    selection?: { shotId?: string; sceneId?: string; timelineId?: string };
  }) => api<AgentPreviewDto>('/agent/preview', { method: 'POST', body }),
  execute: (body: { confirmationToken: string }) =>
    api<{ projectId: string; results: unknown[] }>('/agent/execute', { method: 'POST', body }),
};

export interface ModelAdminDto extends ModelDto {
  description?: string | null;
  deprecated?: boolean;
  connectionOk?: boolean;
}

export const modelsApi = {
  list: (opts?: { all?: boolean }) =>
    api<{ models: ModelDto[] } | ModelDto[]>('/models', {
      query: opts?.all ? { all: '1' } : undefined,
    }).then((r) => (Array.isArray(r) ? r : r.models)),
  get: (id: string) => api<ModelAdminDto>(`/models/${id}`),
  create: (body: {
    id: string;
    providerId: string;
    name: string;
    description?: string;
    parameterSchema?: Record<string, unknown>;
    capabilities?: string[];
    published?: boolean;
  }) => api<ModelAdminDto>('/models', { method: 'POST', body }),
  testConnection: (id: string) =>
    api<{ ok: boolean; providerId: string; message: string }>(`/models/${id}/test-connection`, {
      method: 'POST',
    }),
  testGeneration: (id: string, body?: { prompt?: string }) =>
    api<{ ok: boolean; text?: string; error?: string }>(`/models/${id}/test-generation`, {
      method: 'POST',
      body: body ?? {},
    }),
  publish: (id: string, published = true) =>
    api<ModelAdminDto>(`/models/${id}/publish`, { method: 'POST', body: { published } }),
};

export interface AssetDto {
  id: string;
  projectId: string;
  type: string;
  name: string;
  status?: string;
  rating?: number | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  mimeType?: string | null;
  createdAt?: string;
}

export const billingApi = {
  projectUsage: (projectId: string) => api<Record<string, unknown>>(`/projects/${projectId}/usage`),
  costAnalytics: (projectId: string) =>
    api<Record<string, unknown>>(`/projects/${projectId}/cost-analytics`),
  workspaceBilling: (workspaceId: string) =>
    api<Record<string, unknown>>(`/workspaces/${workspaceId}/billing`),
  listPlans: () =>
    api<{
      provider: string;
      plans: Array<{
        id: string;
        code: string;
        name: string;
        description?: string | null;
        amountUsd: number;
        interval: string;
      }>;
    }>('/billing/plans'),
  subscribeWorkspace: (workspaceId: string, body: { planCode: string; email?: string }) =>
    api<Record<string, unknown>>(`/workspaces/${workspaceId}/billing/subscribe`, {
      method: 'POST',
      body,
    }),
  orgBilling: (organizationId: string) =>
    api<Record<string, unknown>>(`/organizations/${organizationId}/billing`),
};

export const provenanceApi = {
  getCredentials: (assetId: string) =>
    api<{
      assetId: string;
      credentials: Array<Record<string, unknown>>;
      manifests: Array<Record<string, unknown>>;
      actions: Array<Record<string, unknown>>;
      ingredients: Array<Record<string, unknown>>;
      signatures: Array<Record<string, unknown>>;
    }>(`/assets/${assetId}/credentials`),
  sign: (assetId: string, body?: { modelId?: string; prompt?: string; title?: string }) =>
    api<Record<string, unknown>>(`/assets/${assetId}/credentials/sign`, {
      method: 'POST',
      body: body ?? {},
    }),
};

export const gpuApi = {
  listEndpoints: () =>
    api<{ endpoints: Array<Record<string, unknown>> }>('/gpu/endpoints'),
  createEndpoint: (body: {
    name: string;
    baseUrl: string;
    kind?: string;
    apiKey?: string;
  }) =>
    api<Record<string, unknown>>('/gpu/endpoints', {
      method: 'POST',
      body,
    }),
  healthCheck: (id: string) =>
    api<Record<string, unknown>>(`/gpu/endpoints/${id}/health`, { method: 'POST' }),
  listPools: () => api<{ pools: unknown[]; nodes: unknown[] }>('/gpu/pools'),
};


export interface BrandDnaDto {
  logoUrl?: string;
  colors?: string[];
  fonts?: string[];
  voice?: string;
  audience?: string;
  competitors?: string[];
  cta?: string;
  approvedClaims?: string[];
  forbiddenClaims?: string[];
  source?: string;
  sourceUrl?: string;
  rawNotes?: string;
}

export interface BrandDto {
  id: string;
  projectId: string;
  name: string;
  dna: BrandDnaDto;
  status?: string;
  version?: number;
}

export interface PackshotDto {
  id: string;
  productId: string;
  url?: string | null;
  label?: string | null;
  sortOrder?: number;
}

export interface ProductDto {
  id: string;
  projectId: string;
  brandId?: string | null;
  name: string;
  properties?: Record<string, unknown>;
  status?: string;
  packshots?: PackshotDto[];
}

export interface CampaignTemplateDto {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  beats: Array<{
    type: string;
    label?: string;
    startSec: number;
    endSec: number;
    locked?: boolean;
    promptHint?: string;
  }>;
  defaultDurationSec?: number;
}

export interface CampaignBeatDto {
  id: string;
  campaignId: string;
  beatType: string;
  label?: string | null;
  startSec: number;
  endSec: number;
  prompt?: string | null;
  copy?: string | null;
  shotId?: string | null;
  locked?: boolean;
  status?: string;
  sortOrder?: number;
}

export interface CampaignDto {
  id: string;
  projectId: string;
  name: string;
  status?: string;
  durationSec?: number;
  brandId?: string | null;
  productId?: string | null;
  templateId?: string | null;
  beats?: CampaignBeatDto[];
}

export interface VariantCellDto {
  format: string;
  language: string;
  durationSec: number;
  status: 'missing' | 'ready' | 'generating';
  variantId?: string | null;
  branchId?: string | null;
  estimatedCostUsd?: string | number | null;
  jobId?: string | null;
}

export interface VariantMatrixDto {
  campaignId: string;
  formats: string[];
  languages: string[];
  durations: number[];
  cells: VariantCellDto[];
  summary: { missing: number; ready: number; generating: number };
}

export const commercialApi = {
  getBrand: (projectId: string) => api<BrandDto | null>(`/projects/${projectId}/brand`),
  ingestBrand: (
    projectId: string,
    body: { source: 'url' | 'kit' | 'product' | 'brief'; url?: string; text?: string; kit?: Record<string, unknown> },
  ) => api<BrandDto>(`/projects/${projectId}/brand/ingest`, { method: 'POST', body }),
  patchBrand: (projectId: string, body: Partial<BrandDnaDto>) =>
    api<BrandDto>(`/projects/${projectId}/brand`, { method: 'PATCH', body }),
  listProducts: (projectId: string) => api<ProductDto[]>(`/projects/${projectId}/products`),
  createProduct: (projectId: string, body: { name: string; brandId?: string; properties?: Record<string, unknown> }) =>
    api<ProductDto>(`/projects/${projectId}/products`, { method: 'POST', body }),
  updateProduct: (id: string, body: Partial<{ name: string; status: string; properties: Record<string, unknown> }>) =>
    api<ProductDto>(`/products/${id}`, { method: 'PATCH', body }),
  deleteProduct: (id: string) => api(`/products/${id}`, { method: 'DELETE' }),
  addPackshot: (productId: string, body: { url?: string; label?: string; assetId?: string }) =>
    api<PackshotDto>(`/products/${productId}/packshots`, { method: 'POST', body }),
  deletePackshot: (id: string) => api(`/packshots/${id}`, { method: 'DELETE' }),
  listTemplates: () => api<CampaignTemplateDto[]>('/commercial/templates'),
  listCampaigns: (projectId: string) => api<CampaignDto[]>(`/projects/${projectId}/campaigns`),
  createCampaign: (
    projectId: string,
    body: { templateSlug?: string; templateId?: string; name?: string; productId?: string },
  ) => api<CampaignDto>(`/projects/${projectId}/campaigns`, { method: 'POST', body }),
  getCampaign: (id: string) => api<CampaignDto>(`/campaigns/${id}`),
  patchBeat: (
    id: string,
    body: Partial<{ label: string; prompt: string; copy: string; locked: boolean; startSec: number; endSec: number }>,
  ) => api<CampaignBeatDto>(`/campaigns/beats/${id}`, { method: 'PATCH', body }),
  regenerateBeat: (id: string) =>
    api<{ beatId: string; job: GenerationJobDto; status: string }>(`/campaigns/beats/${id}/regenerate`, {
      method: 'POST',
    }),
  variantMatrix: (campaignId: string) => api<VariantMatrixDto>(`/campaigns/${campaignId}/variants/matrix`),
  estimateVariants: (
    campaignId: string,
    cells: Array<{ format: string; language: string; durationSec: number }>,
  ) =>
    api<{ totalUsd: number; cellCount: number; items: unknown[] }>(`/campaigns/${campaignId}/variants/estimate`, {
      method: 'POST',
      body: { cells },
    }),
  generateVariants: (
    campaignId: string,
    body: {
      cells: Array<{ format: string; language: string; durationSec: number }>;
      selective?: boolean;
      regenerateBeats?: string[];
    },
  ) => api<Record<string, unknown>>(`/campaigns/${campaignId}/variants/generate`, { method: 'POST', body }),
};

export function asNumber(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v) || 0;
}

// ── Audio Lab ──────────────────────────────────────────────────

export interface DialogueLineDto {
  id: string;
  projectId: string;
  scriptVersionId?: string | null;
  speaker?: string | null;
  text: string;
  lineIndex: number;
  startSec?: number | null;
  endSec?: number | null;
  status?: string;
  characterId?: string | null;
}

export interface AdrSessionDto {
  id: string;
  projectId: string;
  name: string;
  dialogueLineId?: string | null;
  status?: string;
  loopInSec?: number | null;
  loopOutSec?: number | null;
  takes?: AdrTakeDto[];
}

export interface AdrTakeDto {
  id: string;
  sessionId: string;
  number: number;
  assetId?: string | null;
  rating?: number | null;
  selected?: boolean;
  status?: string;
  notes?: string | null;
}

export interface AudioStemDto {
  id: string;
  projectId: string;
  sourceAssetId?: string | null;
  assetId?: string | null;
  stemType: string;
  label?: string | null;
  status?: string;
  jobId?: string | null;
  sortOrder?: number;
}

export interface DubbingTrackDto {
  id: string;
  projectId: string;
  language: string;
  dialogueLineId?: string | null;
  assetId?: string | null;
  lipSyncDriftMs?: number | null;
  status?: string;
  variantLabel?: string | null;
}

export interface MixBusDto {
  id: string;
  projectId: string;
  name: string;
  busType?: string;
  gainDb: number;
  pan: number;
  muted?: boolean;
  solo?: boolean;
  assetId?: string | null;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}

export const audioApi = {
  listDialogue: (projectId: string) =>
    api<DialogueLineDto[]>(`/projects/${projectId}/audio/dialogue`),
  extractDialogue: (projectId: string, body?: { scriptVersionId?: string; replace?: boolean }) =>
    api<{ count: number; lines: DialogueLineDto[]; scriptVersionId: string }>(
      `/projects/${projectId}/audio/dialogue/extract`,
      { method: 'POST', body: body ?? {} },
    ),
  patchDialogue: (id: string, body: Partial<DialogueLineDto>) =>
    api<DialogueLineDto>(`/dialogue-lines/${id}`, { method: 'PATCH', body }),
  listAdrSessions: (projectId: string) =>
    api<AdrSessionDto[]>(`/projects/${projectId}/audio/adr-sessions`),
  createAdrSession: (
    projectId: string,
    body: { name: string; dialogueLineId?: string; loopInSec?: number; loopOutSec?: number },
  ) => api<AdrSessionDto>(`/projects/${projectId}/audio/adr-sessions`, { method: 'POST', body }),
  getAdrSession: (id: string) => api<AdrSessionDto & { takes: AdrTakeDto[] }>(`/adr-sessions/${id}`),
  createAdrTake: (sessionId: string, body?: { rating?: number; notes?: string; assetId?: string }) =>
    api<AdrTakeDto>(`/adr-sessions/${sessionId}/takes`, { method: 'POST', body: body ?? {} }),
  patchAdrTake: (
    id: string,
    body: Partial<Pick<AdrTakeDto, 'rating' | 'selected' | 'status' | 'notes'>>,
  ) => api<AdrTakeDto>(`/adr-takes/${id}`, { method: 'PATCH', body }),
  listStems: (projectId: string) => api<AudioStemDto[]>(`/projects/${projectId}/audio/stems`),
  stemSplit: (projectId: string, body: { assetId: string; prompt?: string }) =>
    api<{ job: GenerationJobDto; stems: AudioStemDto[] }>(`/projects/${projectId}/audio/stems/split`, {
      method: 'POST',
      body,
    }),
  listMixBuses: (projectId: string) => api<MixBusDto[]>(`/projects/${projectId}/audio/mix-buses`),
  createMixBus: (projectId: string, body: { name: string; gainDb?: number; pan?: number }) =>
    api<MixBusDto>(`/projects/${projectId}/audio/mix-buses`, { method: 'POST', body }),
  patchMixBus: (id: string, body: Partial<Pick<MixBusDto, 'gainDb' | 'pan' | 'muted' | 'solo' | 'name'>>) =>
    api<MixBusDto>(`/audio-mix-buses/${id}`, { method: 'PATCH', body }),
  listDubbing: (projectId: string) => api<DubbingTrackDto[]>(`/projects/${projectId}/audio/dubbing`),
  createDubbing: (
    projectId: string,
    body: { language: string; dialogueLineId?: string; variantLabel?: string },
  ) => api<DubbingTrackDto>(`/projects/${projectId}/audio/dubbing`, { method: 'POST', body }),
  patchDubbing: (id: string, body: Partial<DubbingTrackDto>) =>
    api<DubbingTrackDto>(`/dubbing-tracks/${id}`, { method: 'PATCH', body }),
};

// ── Music Studio ───────────────────────────────────────────────

export interface MidiEventDto {
  id: string;
  clipId: string;
  timeSec: number;
  durationSec: number;
  note: number;
  velocity: number;
  eventType?: string;
}

export interface MidiClipDto {
  id: string;
  projectId: string;
  name: string;
  startSec: number;
  durationSec: number;
  channel?: number;
  instrument?: string | null;
  status?: string;
  events?: MidiEventDto[];
}

export interface ScoreCueDto {
  id: string;
  projectId: string;
  name: string;
  timeSec: number;
  cueType: string;
  description?: string | null;
  timelineId?: string | null;
}

export interface TempoMapDto {
  id: string;
  projectId: string;
  name: string;
  bpm: number;
  timeSignature: string;
  startSec: number;
  points?: unknown[];
  timelineId?: string | null;
}

export interface MusicStemDto {
  id: string;
  projectId: string;
  name: string;
  stemType?: string;
  muted?: boolean;
  solo?: boolean;
  gainDb: number;
  pan: number;
  assetId?: string | null;
  sortOrder?: number;
}

export interface ScoreMarkerDto {
  id: string;
  projectId: string;
  timelineId: string;
  timeSec: number;
  label: string;
  color?: string | null;
  kind?: string;
}

export const musicApi = {
  listMidiClips: (projectId: string) =>
    api<MidiClipDto[]>(`/projects/${projectId}/music/midi-clips`),
  createMidiClip: (projectId: string, body: { name: string; durationSec?: number }) =>
    api<MidiClipDto>(`/projects/${projectId}/music/midi-clips`, { method: 'POST', body }),
  getMidiClip: (id: string) => api<MidiClipDto & { events: MidiEventDto[] }>(`/midi-clips/${id}`),
  generateMidi: (projectId: string, body?: { prompt?: string; name?: string; durationSec?: number }) =>
    api<{ job: GenerationJobDto; clip: MidiClipDto }>(`/projects/${projectId}/music/midi/generate`, {
      method: 'POST',
      body: body ?? {},
    }),
  addMidiEvent: (
    clipId: string,
    body: { timeSec: number; note: number; durationSec?: number; velocity?: number },
  ) => api<MidiEventDto>(`/midi-clips/${clipId}/events`, { method: 'POST', body }),
  deleteMidiEvent: (clipId: string, eventId: string) =>
    api(`/midi-clips/${clipId}/events/${eventId}`, { method: 'DELETE' }),
  listScoreCues: (projectId: string) =>
    api<ScoreCueDto[]>(`/projects/${projectId}/music/score-cues`),
  createScoreCue: (
    projectId: string,
    body: { name: string; timeSec: number; cueType?: string; description?: string },
  ) => api<ScoreCueDto>(`/projects/${projectId}/music/score-cues`, { method: 'POST', body }),
  listTempoMaps: (projectId: string) =>
    api<TempoMapDto[]>(`/projects/${projectId}/music/tempo-maps`),
  createTempoMap: (projectId: string, body?: { bpm?: number; timeSignature?: string; name?: string }) =>
    api<TempoMapDto>(`/projects/${projectId}/music/tempo-maps`, { method: 'POST', body: body ?? {} }),
  patchTempoMap: (id: string, body: Partial<Pick<TempoMapDto, 'bpm' | 'timeSignature' | 'name'>>) =>
    api<TempoMapDto>(`/tempo-maps/${id}`, { method: 'PATCH', body }),
  listStems: (projectId: string) => api<MusicStemDto[]>(`/projects/${projectId}/music/stems`),
  createStem: (projectId: string, body: { name: string; stemType?: string }) =>
    api<MusicStemDto>(`/projects/${projectId}/music/stems`, { method: 'POST', body }),
  patchStem: (
    id: string,
    body: Partial<Pick<MusicStemDto, 'muted' | 'solo' | 'gainDb' | 'pan' | 'name'>>,
  ) => api<MusicStemDto>(`/music-stems/${id}`, { method: 'PATCH', body }),
  listScoreMarkers: (projectId: string, timelineId?: string) =>
    api<ScoreMarkerDto[]>(`/projects/${projectId}/music/score-markers`, {
      query: timelineId ? { timelineId } : undefined,
    }),
  createScoreMarker: (
    projectId: string,
    body: { timelineId: string; timeSec: number; label: string; color?: string },
  ) => api<ScoreMarkerDto>(`/projects/${projectId}/music/score-markers`, { method: 'POST', body }),
  promoteMarkers: (projectId: string, timelineId: string) =>
    api<{ count: number; markers: ScoreMarkerDto[] }>(
      `/projects/${projectId}/music/score-markers/promote`,
      { method: 'POST', body: { timelineId } },
    ),
};

export interface ContinuityCheckDto {
  id: string;
  projectId: string;
  scopeType: string;
  scopeId?: string | null;
  status: string;
  triggeredBy?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ContinuityScoreDto {
  id: string;
  checkId: string;
  shotId: string;
  takeId?: string | null;
  dimension: string;
  score: number;
  details?: Record<string, unknown>;
  citations?: unknown[];
}

export interface ContinuityHeatmapCell {
  sceneId: string;
  number: number;
  slug: string;
  heading: string;
  minScore: number;
  avgScore: number;
  violations: number;
  scoreCount: number;
}

export interface ContinuityCheckDetailDto extends ContinuityCheckDto {
  scores: ContinuityScoreDto[];
  comparisons: Array<{
    id: string;
    checkId: string;
    leftShotId: string;
    rightShotId: string;
    leftTakeId?: string | null;
    rightTakeId?: string | null;
    embeddingDistance?: number | null;
    diff?: Record<string, unknown>;
  }>;
  repairs: Array<{
    id: string;
    checkId: string;
    scoreId: string;
    shotId: string;
    strategy: string;
    jobId?: string | null;
    status: string;
    createdAt: string;
  }>;
  heatmap: ContinuityHeatmapCell[];
  violations: ContinuityScoreDto[];
}

export const continuityApi = {
  run: (
    projectId: string,
    body?: { scopeType?: 'project' | 'sequence' | 'scene'; scopeId?: string | null },
  ) =>
    api<ContinuityCheckDetailDto>(`/projects/${projectId}/continuity/run`, {
      method: 'POST',
      body: body ?? { scopeType: 'project' },
    }),
  listChecks: (projectId: string) =>
    api<ContinuityCheckDto[]>(`/projects/${projectId}/continuity/checks`),
  getCheck: (id: string) => api<ContinuityCheckDetailDto>(`/continuity/checks/${id}`),
  repairScore: (id: string) =>
    api<{ repair: unknown; job: GenerationJobDto; hardConstraint: string; staleDependents: string[] }>(
      `/continuity/scores/${id}/repair`,
      { method: 'POST' },
    ),
  repairBatch: (id: string) =>
    api<{ checkId: string; repairs: unknown[]; count?: number; message?: string }>(
      `/continuity/checks/${id}/repair-batch`,
      { method: 'POST' },
    ),
};

export interface ColorWheelDto {
  r: number;
  g: number;
  b: number;
}

export interface ClipColorStateDto {
  id: string;
  projectId: string;
  timelineId?: string | null;
  clipId: string;
  gradeId?: string | null;
  lift: ColorWheelDto;
  gamma: ColorWheelDto;
  gain: ColorWheelDto;
  curves: Record<string, Array<[number, number]>>;
  qualifiers: {
    hue: [number, number];
    saturation: [number, number];
    luminance: [number, number];
  };
}

export interface ColorGradeDto {
  id: string;
  projectId: string;
  name: string;
  nodeGraph: { nodes: unknown[]; edges: unknown[] };
  version: number;
  lookId?: string | null;
  lutId?: string | null;
}

export interface ColorScopeAnalyzeDto {
  scopes: {
    waveform: {
      luma: number[];
      rgb: { r: number[]; g: number[]; b: number[] };
    };
    vectorscope: { points: Array<{ u: number; v: number; w: number }> };
    histogram: { r: number[]; g: number[]; b: number[]; y: number[] };
    proxy: {
      assetId: string | null;
      width: number;
      height: number;
      durationSec: number | null;
      fps: number | null;
      metadata: Record<string, unknown>;
    };
  };
  snapshots: unknown[];
}

export const colorApi = {
  listGrades: (projectId: string) =>
    api<ColorGradeDto[]>(`/projects/${projectId}/color/grades`),
  createGrade: (projectId: string, body: { name: string }) =>
    api<ColorGradeDto>(`/projects/${projectId}/color/grades`, { method: 'POST', body }),
  listLuts: (projectId: string) => api<unknown[]>(`/projects/${projectId}/color/luts`),
  createLut: (projectId: string, body: { name: string; storageKey?: string }) =>
    api<unknown>(`/projects/${projectId}/color/luts`, { method: 'POST', body }),
  listLooks: (projectId: string) => api<unknown[]>(`/projects/${projectId}/color/looks`),
  createLook: (projectId: string, body: { name: string }) =>
    api<unknown>(`/projects/${projectId}/color/looks`, { method: 'POST', body }),
  listClipStates: (projectId: string, timelineId?: string) =>
    api<ClipColorStateDto[]>(`/projects/${projectId}/color/clip-state`, {
      query: timelineId ? { timelineId } : undefined,
    }),
  upsertClipState: (
    projectId: string,
    body: Partial<ClipColorStateDto> & { clipId: string },
  ) => api<ClipColorStateDto>(`/projects/${projectId}/color/clip-state`, { method: 'POST', body }),
  analyzeScopes: (
    projectId: string,
    body?: { timelineId?: string; clipId?: string; assetId?: string },
  ) =>
    api<ColorScopeAnalyzeDto>(`/projects/${projectId}/color/scopes/analyze`, {
      method: 'POST',
      body: body ?? {},
    }),
  listScopes: (projectId: string) => api<unknown[]>(`/projects/${projectId}/color/scopes`),
};

export interface MulticamAngleDto {
  id: string;
  groupId: string;
  projectId: string;
  name: string;
  label: string;
  assetId?: string | null;
  sortOrder: number;
  offsetSec: number;
}

export interface MulticamGroupDto {
  id: string;
  projectId: string;
  timelineId?: string | null;
  name: string;
  activeAngleId?: string | null;
  syncOffsetSec: number;
  angles: MulticamAngleDto[];
}

export interface RotoShapeDto {
  id: string;
  projectId: string;
  maskId?: string | null;
  clipId?: string | null;
  name: string;
  points: Array<{
    x: number;
    y: number;
    handleIn?: { x: number; y: number };
    handleOut?: { x: number; y: number };
  }>;
  frameIn: number;
  frameOut: number;
  keyframes: Array<{ frame: number; points: unknown[] }>;
}

export interface MatteDto {
  id: string;
  projectId: string;
  rotoShapeId?: string | null;
  maskId?: string | null;
  assetId?: string | null;
  jobId?: string | null;
  status: string;
}

export const multicamApi = {
  listGroups: (projectId: string) =>
    api<MulticamGroupDto[]>(`/projects/${projectId}/multicam/groups`),
  createGroup: (projectId: string, body: { name: string; timelineId?: string }) =>
    api<MulticamGroupDto>(`/projects/${projectId}/multicam/groups`, { method: 'POST', body }),
  getGroup: (id: string) => api<MulticamGroupDto>(`/multicam-groups/${id}`),
  createAngle: (
    groupId: string,
    body: { name: string; label?: string; assetId?: string; offsetSec?: number },
  ) => api<MulticamAngleDto>(`/multicam-groups/${groupId}/angles`, { method: 'POST', body }),
  setActiveAngle: (groupId: string, angleId: string) =>
    api<{ id: string; angle: MulticamAngleDto }>(`/multicam-groups/${groupId}/active-angle`, {
      method: 'POST',
      body: { angleId },
    }),
  listMasks: (projectId: string) => api<unknown[]>(`/projects/${projectId}/multicam/masks`),
  createMask: (projectId: string, body: { name: string; clipId?: string; feather?: number }) =>
    api<unknown>(`/projects/${projectId}/multicam/masks`, { method: 'POST', body }),
  listRotoShapes: (projectId: string) =>
    api<RotoShapeDto[]>(`/projects/${projectId}/multicam/roto-shapes`),
  createRotoShape: (
    projectId: string,
    body: {
      name: string;
      points?: RotoShapeDto['points'];
      frameIn?: number;
      frameOut?: number;
      clipId?: string;
      maskId?: string;
    },
  ) =>
    api<RotoShapeDto>(`/projects/${projectId}/multicam/roto-shapes`, { method: 'POST', body }),
  patchRotoShape: (
    id: string,
    body: Partial<Pick<RotoShapeDto, 'name' | 'points' | 'frameIn' | 'frameOut' | 'keyframes'>>,
  ) => api<RotoShapeDto>(`/roto-shapes/${id}`, { method: 'PATCH', body }),
  listMattes: (projectId: string) => api<MatteDto[]>(`/projects/${projectId}/multicam/mattes`),
  createMatte: (projectId: string, body: { rotoShapeId?: string; maskId?: string; prompt?: string }) =>
    api<{ matte: MatteDto; job: GenerationJobDto }>(`/projects/${projectId}/multicam/mattes`, {
      method: 'POST',
      body,
    }),
};

// ——— E1 Fine-tuning ———

export interface DatasetDto {
  id: string;
  projectId: string;
  name: string;
  type: string;
  consent: Record<string, unknown>;
  rights: Record<string, unknown>;
  version: number;
  createdAt?: string;
  items?: Array<{
    id: string;
    assetId: string;
    caption?: string | null;
    metadata?: Record<string, unknown>;
  }>;
}

export interface TrainingRunDto {
  id: string;
  projectId: string;
  fineTuneId?: string | null;
  datasetId?: string | null;
  name: string;
  status: string;
  config: Record<string, unknown>;
  costEstimateUsd?: string | number | null;
  createdAt?: string;
  checkpoints?: unknown[];
  metrics?: unknown[];
  adapters?: AdapterDto[];
}

export interface AdapterDto {
  id: string;
  projectId: string;
  runId?: string | null;
  name: string;
  rank: number;
  baseModel: string;
  storageKey: string;
  status: string;
  modelHubId?: string | null;
}

export const trainingApi = {
  listDatasets: (projectId: string) =>
    api<DatasetDto[]>(`/projects/${projectId}/training/datasets`),
  createDataset: (
    projectId: string,
    body: {
      name: string;
      type?: string;
      consent?: { granted?: boolean; rightsCleared?: boolean; note?: string };
      rights?: Record<string, unknown>;
    },
  ) => api<DatasetDto>(`/projects/${projectId}/training/datasets`, { method: 'POST', body }),
  getDataset: (id: string) => api<DatasetDto>(`/datasets/${id}`),
  addDatasetItem: (
    datasetId: string,
    body: { assetId: string; caption?: string; metadata?: Record<string, unknown> },
  ) => api(`/datasets/${datasetId}/items`, { method: 'POST', body }),
  listRuns: (projectId: string) =>
    api<TrainingRunDto[]>(`/projects/${projectId}/training/runs`),
  listFineTunes: (projectId: string) =>
    api<unknown[]>(`/projects/${projectId}/training/fine-tunes`),
  launchFineTune: (
    projectId: string,
    body: {
      name?: string;
      datasetId: string;
      type?: string;
      config?: Record<string, unknown>;
      baseModel?: string;
      rank?: number;
    },
  ) =>
    api<{
      fineTune: unknown;
      run: TrainingRunDto;
      adapter: AdapterDto;
      costEstimateUsd: number;
    }>(`/projects/${projectId}/training/fine-tunes`, { method: 'POST', body }),
  getRun: (id: string) => api<TrainingRunDto>(`/training-runs/${id}`),
  appendMetrics: (
    runId: string,
    body: { metrics: Array<{ step?: number; name: string; value: number; metadata?: Record<string, unknown> }> },
  ) => api(`/training-runs/${runId}/metrics`, { method: 'POST', body }),
  listCheckpoints: (runId: string) => api<unknown[]>(`/training-runs/${runId}/checkpoints`),
  listAdapters: (projectId: string) =>
    api<AdapterDto[]>(`/projects/${projectId}/training/adapters`),
  promoteAdapter: (adapterId: string, body?: { name?: string; providerId?: string; publish?: boolean }) =>
    api<{ adapter: AdapterDto; model: unknown }>(`/adapters/${adapterId}/promote`, {
      method: 'POST',
      body: body ?? {},
    }),
};

// ——— E2 Workflows ———

export interface WorkflowNodeDto {
  key: string;
  type: string;
  label?: string;
  config?: Record<string, unknown>;
  positionX?: number;
  positionY?: number;
  fanOut?: boolean;
}

export interface WorkflowEdgeDto {
  sourceKey: string;
  targetKey: string;
  condition?: { field?: string; equals?: unknown; in?: unknown[]; always?: boolean };
  label?: string;
}

export interface WorkflowDefinitionDto {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  version: number;
  status: string;
  graph: Record<string, unknown>;
  nodes?: Array<WorkflowNodeDto & { id?: string }>;
  edges?: Array<WorkflowEdgeDto & { id?: string }>;
  updatedAt?: string;
}

export interface WorkflowRunDto {
  id: string;
  projectId: string;
  definitionId: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string | null;
  steps?: Array<{
    id: string;
    nodeKey: string;
    stepType: string;
    status: string;
    fanOut: boolean;
    output: Record<string, unknown>;
    error?: string | null;
  }>;
  createdAt?: string;
}

export const workflowsApi = {
  listSteps: () => api<{ steps: string[] }>('/workflows/steps'),
  list: (projectId: string) =>
    api<WorkflowDefinitionDto[]>(`/projects/${projectId}/workflows`),
  create: (
    projectId: string,
    body: {
      name: string;
      description?: string;
      entry?: string;
      nodes: WorkflowNodeDto[];
      edges?: WorkflowEdgeDto[];
      status?: string;
    },
  ) => api<WorkflowDefinitionDto>(`/projects/${projectId}/workflows`, { method: 'POST', body }),
  get: (id: string) => api<WorkflowDefinitionDto>(`/workflows/${id}`),
  patch: (
    id: string,
    body: Partial<{
      name: string;
      description: string | null;
      entry: string;
      nodes: WorkflowNodeDto[];
      edges: WorkflowEdgeDto[];
      status: string;
    }>,
  ) => api<WorkflowDefinitionDto>(`/workflows/${id}`, { method: 'PATCH', body }),
  startRun: (definitionId: string, body?: { input?: Record<string, unknown> }) =>
    api<WorkflowRunDto>(`/workflows/${definitionId}/runs`, { method: 'POST', body: body ?? {} }),
  listRuns: (projectId: string, definitionId?: string) =>
    api<WorkflowRunDto[]>(`/projects/${projectId}/workflow-runs`, {
      query: definitionId ? { definitionId } : undefined,
    }),
  getRun: (id: string) => api<WorkflowRunDto>(`/workflow-runs/${id}`),
};

// ——— E3 Collab ———

export interface PresenceSessionDto {
  id: string;
  projectId: string;
  roomId?: string | null;
  userId: string;
  displayName?: string | null;
  color?: string | null;
  cursorX?: number | null;
  cursorY?: number | null;
  selection?: Record<string, unknown>;
  lastSeenAt?: string;
}

export interface CollabCommentDto {
  id: string;
  projectId: string;
  userId: string;
  parentId?: string | null;
  targetType: string;
  targetId: string;
  body: string;
  timecode?: number | null;
  resolved: boolean;
  createdAt?: string;
  replies?: CollabCommentDto[];
}

export interface CollabRoomDto {
  id: string;
  projectId: string;
  name: string;
  kind: string;
  targetType?: string | null;
  targetId?: string | null;
}

export const collabApi = {
  listRooms: (projectId: string) =>
    api<CollabRoomDto[]>(`/projects/${projectId}/collab/rooms`),
  createRoom: (
    projectId: string,
    body: { name: string; kind?: string; targetType?: string; targetId?: string },
  ) => api<CollabRoomDto>(`/projects/${projectId}/collab/rooms`, { method: 'POST', body }),
  listPresence: (projectId: string) =>
    api<PresenceSessionDto[]>(`/projects/${projectId}/collab/presence`),
  joinPresence: (
    projectId: string,
    body?: { roomId?: string; displayName?: string; color?: string },
  ) =>
    api<PresenceSessionDto>(`/projects/${projectId}/collab/presence`, {
      method: 'POST',
      body: body ?? {},
    }),
  leavePresence: (sessionId: string) =>
    api<{ ok: boolean }>(`/presence/${sessionId}`, { method: 'DELETE' }),
  updateCursor: (
    sessionId: string,
    body: { cursorX?: number; cursorY?: number; selection?: Record<string, unknown> },
  ) => api<PresenceSessionDto>(`/presence/${sessionId}/cursor`, { method: 'PATCH', body }),
  getDoc: (projectId: string, docKey: string) =>
    api<{
      id: string;
      docKey: string;
      stateBase64?: string | null;
      stateText?: string | null;
      version: number;
    } | null>(`/projects/${projectId}/collab/docs/${encodeURIComponent(docKey)}`),
  upsertDoc: (
    projectId: string,
    body: { docKey: string; roomId?: string; stateBase64?: string; stateText?: string },
  ) => api(`/projects/${projectId}/collab/docs`, { method: 'POST', body }),
  listComments: (
    projectId: string,
    query?: { targetType?: string; targetId?: string; threaded?: boolean },
  ) =>
    api<CollabCommentDto[]>(`/projects/${projectId}/collab/comments`, {
      query: {
        targetType: query?.targetType,
        targetId: query?.targetId,
        threaded: query?.threaded ? '1' : undefined,
      },
    }),
  createComment: (
    projectId: string,
    body: {
      targetType: string;
      targetId: string;
      body: string;
      parentId?: string;
      timecode?: number;
    },
  ) => api<CollabCommentDto>(`/projects/${projectId}/collab/comments`, { method: 'POST', body }),
  /** WebSocket URL for realtime presence / yjs / timeline.command broadcast */
  wsUrl: () => {
    const base = API_URL.replace(/^http/, 'ws');
    return `${base}/collab`;
  },
};

