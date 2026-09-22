import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { LocalIdentityProvider } from '@studio-os/auth';
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  type Env,
} from '@studio-os/contracts';
import { users, organizationMembers, workspaces, type Database } from '@studio-os/db';
import { eq, inArray } from 'drizzle-orm';
import { ENV } from '../config/env.js';
import { DB } from '../db/db.tokens.js';
import type { AuthUser } from './auth.guard.js';

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
}

export interface MePayload {
  user: AuthUser;
  workspaces: WorkspaceSummary[];
}

@Injectable()
export class AuthService {
  private readonly identity = new LocalIdentityProvider();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async register(body: unknown): Promise<{ user: AuthUser; token: string }> {
    const parsed = RegisterRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const { email, password, name } = parsed.data;

    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.identity.hashPassword(password);
    const [created] = await this.db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        name,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
      });

    if (!created) throw new BadRequestException('Failed to create user');
    const token = await this.identity.createSessionToken(created.id, this.env.JWT_SECRET);
    return { user: created, token };
  }

  async login(body: unknown): Promise<{ user: AuthUser; token: string }> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const { email, password } = parsed.data;

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await this.identity.verifyPassword(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.identity.createSessionToken(user.id, this.env.JWT_SECRET);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      token,
    };
  }

  async me(userId: string): Promise<MePayload> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new UnauthorizedException('User not found');

    const memberOrgs = await this.db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));

    const orgIds = [...new Set(memberOrgs.map((m) => m.organizationId))];
    let workspaceRows: WorkspaceSummary[] = [];
    if (orgIds.length > 0) {
      workspaceRows = await this.db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          organizationId: workspaces.organizationId,
        })
        .from(workspaces)
        .where(inArray(workspaces.organizationId, orgIds));
    }

    return { user, workspaces: workspaceRows };
  }
}
