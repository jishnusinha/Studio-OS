import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

export interface IdentityProvider {
  hashPassword(pw: string): Promise<string>;
  verifyPassword(pw: string, hash: string): Promise<boolean>;
  createSessionToken(userId: string, secret: string, expiresIn?: string): Promise<string>;
  verifySessionToken(token: string, secret: string): Promise<{ userId: string } | null>;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export class LocalIdentityProvider implements IdentityProvider {
  constructor(private readonly saltRounds = 10) {}

  async hashPassword(pw: string): Promise<string> {
    return bcrypt.hash(pw, this.saltRounds);
  }

  async verifyPassword(pw: string, hash: string): Promise<boolean> {
    return bcrypt.compare(pw, hash);
  }

  async createSessionToken(
    userId: string,
    secret: string,
    expiresIn = '7d',
  ): Promise<string> {
    return new SignJWT({ sub: userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(secretKey(secret));
  }

  async verifySessionToken(
    token: string,
    secret: string,
  ): Promise<{ userId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, secretKey(secret));
      const userId = typeof payload.sub === 'string' ? payload.sub : null;
      if (!userId) return null;
      return { userId };
    } catch {
      return null;
    }
  }
}
