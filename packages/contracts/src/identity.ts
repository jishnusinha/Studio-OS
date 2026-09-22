import { z } from 'zod';
import { IdSchema, ProjectRoleSchema } from './common.js';

export const UserSchema = z.object({
  id: IdSchema,
  email: z.string().email(),
  name: z.string().min(1).max(200),
  avatarUrl: z.string().url().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;

export const OrganizationSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(80),
  createdAt: z.coerce.date(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const WorkspaceSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(80),
  createdAt: z.coerce.date(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const ProjectTypeSchema = z.enum(['cinema', 'commercial', 'music_video', 'social', 'other']);
export type ProjectType = z.infer<typeof ProjectTypeSchema>;

export const ProjectSchema = z.object({
  id: IdSchema,
  workspaceId: IdSchema,
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(80),
  type: ProjectTypeSchema,
  description: z.string().nullable().optional(),
  budgetUsd: z.number().nonnegative().nullable().optional(),
  spentUsd: z.number().nonnegative().default(0),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectMemberSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  userId: IdSchema,
  role: ProjectRoleSchema,
  createdAt: z.coerce.date(),
});
export type ProjectMember = z.infer<typeof ProjectMemberSchema>;

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const CreateProjectRequestSchema = z.object({
  workspaceId: IdSchema,
  name: z.string().min(1).max(200),
  type: ProjectTypeSchema.default('cinema'),
  description: z.string().optional(),
  budgetUsd: z.number().nonnegative().optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
