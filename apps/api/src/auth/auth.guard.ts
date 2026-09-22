import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { LocalIdentityProvider } from '@studio-os/auth';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { users } from '@studio-os/db';
import type { Database } from '@studio-os/db';
import type { Env } from '@studio-os/contracts';
import { Inject } from '@nestjs/common';
import { ENV } from '../config/env.js';
import { DB } from '../db/db.tokens.js';

export const SESSION_COOKIE = 'studio_session';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export type AuthedRequest = Request & { user?: AuthUser };

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly identity = new LocalIdentityProvider();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }

    const session = await this.identity.verifySessionToken(token, this.env.JWT_SECRET);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    req.user = user;
    return true;
  }
}
