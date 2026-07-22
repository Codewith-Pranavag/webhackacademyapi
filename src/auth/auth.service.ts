import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService, type TokenPair } from './token.service';
import { sha256, randomToken } from '../common/crypto.util';
import type { Env } from '../config/env.validation';
import type {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';

type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

const USER_INCLUDE = { roles: { include: { role: true } } } as const;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  roles: string[];
  emailVerified: boolean;
  headline?: string;
  joinedAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  tokens: TokenPair;
  /** Dev convenience — only populated outside production so the flow is testable without SMTP. */
  devVerificationToken?: string;
}

interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly isProd: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    config: ConfigService<Env, true>,
  ) {
    this.isProd = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  // ----------------------------------------------------------------- Register
  async register(dto: RegisterDto, meta: RequestMeta): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const passwordHash = await argonHash(dto.password);

    const { user, verificationToken } = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing) throw new ConflictException('Email is already in use.');

        const role = await tx.role.upsert({
          where: { key: 'student' },
          update: {},
          create: { key: 'student', name: 'Student' },
        });

        const created = await tx.user.create({
          data: {
            name: dto.name,
            email,
            passwordHash,
            roles: { create: { roleId: role.id } },
          },
          include: USER_INCLUDE,
        });

        const rawToken = randomToken();
        await tx.emailVerification.create({
          data: {
            userId: created.id,
            tokenHash: sha256(rawToken),
            expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
          },
        });

        return { user: created, verificationToken: rawToken };
      },
    );

    this.logger.log(
      `Email verification token for ${email}: ${verificationToken}`,
    );

    const tokens = await this.tokens.issuePair(this.tokenUser(user), meta);
    return {
      user: this.toPublicUser(user),
      tokens,
      ...(this.isProd ? {} : { devVerificationToken: verificationToken }),
    };
  }

  // -------------------------------------------------------------------- Login
  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: USER_INCLUDE,
    });

    // Constant-ish response — never reveal which part failed.
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    const valid = await argonVerify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid email or password.');

    if (user.status === 'suspended') {
      throw new ForbiddenException('Your account has been suspended.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.tokens.issuePair(this.tokenUser(user), meta);
    return { user: this.toPublicUser(user), tokens };
  }

  // ------------------------------------------------------------------ Refresh
  async refresh(rawRefreshToken: string | undefined, meta: RequestMeta) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }
    const tokenHash = sha256(rawRefreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!record) throw new UnauthorizedException('Invalid refresh token.');

    // Reuse detection: a revoked token being presented means the family is compromised.
    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(
        `Refresh token reuse detected for family ${record.familyId} — family revoked.`,
      );
      throw new UnauthorizedException('Refresh token reuse detected.');
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
      include: USER_INCLUDE,
    });
    if (!user) throw new UnauthorizedException('Invalid refresh token.');

    // Rotate: revoke the presented token, issue a new one in the same family.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.tokens.issuePair(
      this.tokenUser(user),
      meta,
      record.familyId,
    );
    return { tokens };
  }

  // ------------------------------------------------------------------- Logout
  async logout(rawRefreshToken: string | undefined, userId: string): Promise<void> {
    if (rawRefreshToken) {
      const record = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: sha256(rawRefreshToken) },
      });
      if (record) {
        await this.prisma.refreshToken.updateMany({
          where: { familyId: record.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return;
      }
    }
    // Fallback: revoke all active tokens for the user.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // -------------------------------------------------------- Email verification
  async verifyEmail(token: string): Promise<{ ok: true }> {
    const record = await this.prisma.emailVerification.findFirst({
      where: { tokenHash: sha256(token), usedAt: null },
    });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired verification token.');
    }
    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  async resendVerification(userId: string): Promise<{ ok: true; devVerificationToken?: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.emailVerifiedAt) {
      throw new BadRequestException('Email is already verified.');
    }
    const rawToken = randomToken();
    await this.prisma.emailVerification.create({
      data: {
        userId,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });
    this.logger.log(`Resent verification token for ${user.email}: ${rawToken}`);
    return { ok: true, ...(this.isProd ? {} : { devVerificationToken: rawToken }) };
  }

  // ----------------------------------------------------------- Change password
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw new UnauthorizedException();

    const valid = await argonVerify(user.passwordHash, dto.current);
    if (!valid) throw new BadRequestException('Current password is incorrect.');

    const passwordHash = await argonHash(dto.next);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      // Invalidate all existing sessions on password change.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // Placeholder — password reset (token issuance requires the mail pipeline).
  async resetPassword(_dto: ResetPasswordDto): Promise<void> {
    throw new BadRequestException('Password reset is not available yet.');
  }

  // ---------------------------------------------------------------------- Me
  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: USER_INCLUDE,
    });
    if (!user) throw new UnauthorizedException();
    return this.toPublicUser(user);
  }

  // ------------------------------------------------------------------ Helpers
  private tokenUser(user: UserWithRoles) {
    return {
      id: user.id,
      email: user.email,
      roles: user.roles.map((ur) => ur.role.key),
    };
  }

  private toPublicUser(user: UserWithRoles): PublicUser {
    const roles = user.roles.map((ur) => ur.role.key);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatarUrl ?? undefined,
      role: this.primaryRole(roles),
      roles,
      emailVerified: Boolean(user.emailVerifiedAt),
      headline: user.headline ?? undefined,
      joinedAt: user.createdAt,
    };
  }

  private primaryRole(roles: string[]): string {
    if (roles.includes('admin')) return 'admin';
    if (roles.includes('instructor')) return 'instructor';
    return 'student';
  }
}
