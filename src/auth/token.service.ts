import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { parseDurationMs, randomToken, sha256, uuid } from '../common/crypto.util';
import type { Env } from '../config/env.validation';

export interface AccessTokenUser {
  id: string;
  email: string;
  roles: string[];
}

export interface TokenPair {
  accessToken: string;
  accessExpiresIn: number;
  refreshToken: string;
  tokenType: 'Bearer';
}

interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Signs a short-lived JWT access token. */
  async signAccessToken(user: AccessTokenUser): Promise<{ token: string; expiresIn: number }> {
    const ttl = this.config.get('JWT_ACCESS_TTL', { infer: true });
    // Pass seconds (a number) so we avoid the ms "StringValue" typing quirk.
    const expiresIn = Math.floor(parseDurationMs(ttl) / 1000);
    const token = await this.jwt.signAsync(
      { sub: user.id, email: user.email, roles: user.roles },
      { expiresIn },
    );
    return { token, expiresIn };
  }

  /** Creates + persists a rotating refresh token; returns the raw value (shown once). */
  async createRefreshToken(
    userId: string,
    familyId: string | undefined,
    meta: RequestMeta,
  ): Promise<{ raw: string; familyId: string }> {
    const raw = randomToken(32);
    const ttlMs = parseDurationMs(this.config.get('JWT_REFRESH_TTL', { infer: true }));
    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(raw),
        familyId: familyId ?? uuid(),
        expiresAt: new Date(Date.now() + ttlMs),
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });
    return { raw, familyId: record.familyId };
  }

  /** Issues a full access + refresh pair (new family unless one is provided). */
  async issuePair(
    user: AccessTokenUser,
    meta: RequestMeta,
    familyId?: string,
  ): Promise<TokenPair> {
    const access = await this.signAccessToken(user);
    const refresh = await this.createRefreshToken(user.id, familyId, meta);
    return {
      accessToken: access.token,
      accessExpiresIn: access.expiresIn,
      refreshToken: refresh.raw,
      tokenType: 'Bearer',
    };
  }

  refreshCookieMaxAgeMs(): number {
    return parseDurationMs(this.config.get('JWT_REFRESH_TTL', { infer: true }));
  }
}
