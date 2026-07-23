import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  toPublicUser,
  USER_INCLUDE,
  type PublicUser,
} from '../common/user.mapper';
import type { Env } from '../config/env.validation';
import type { UpdatePreferencesDto, UpdateProfileDto } from './dto/user.dto';

interface UploadedAvatar {
  filename: string;
  mimetype: string;
  size: number;
}

const DEFAULT_PREFERENCES = {
  email: { courseUpdates: true, grades: true, messages: true, marketing: false },
  push: { enabled: true },
  inApp: { enabled: true },
  privacy: { profileVisibility: 'public', showActivity: true },
};

@Injectable()
export class UsersService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: USER_INCLUDE,
    });
    if (!user) throw new NotFoundException('User not found.');
    return toPublicUser(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        headline: dto.headline,
        bio: dto.bio,
        location: dto.location,
        skills: dto.skills,
      },
      include: USER_INCLUDE,
    });
    return toPublicUser(user);
  }

  /** Public profile — respects the owner's visibility preference. */
  async publicProfile(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { ...USER_INCLUDE, notificationPref: true },
    });
    if (!user) throw new NotFoundException('User not found.');

    const privacy = (user.notificationPref?.privacy ?? {}) as {
      profileVisibility?: string;
    };
    if (privacy.profileVisibility === 'private') {
      throw new NotFoundException('This profile is private.');
    }

    return {
      id: user.id,
      name: user.name,
      avatar: user.avatarUrl ?? undefined,
      headline: user.headline ?? undefined,
      bio: user.bio ?? undefined,
      skills: user.skills,
      role: user.roles.map((ur) => ur.role.key),
      joinedAt: user.createdAt,
    };
  }

  async getPreferences(userId: string) {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!pref) return DEFAULT_PREFERENCES;
    return {
      email: pref.email ?? DEFAULT_PREFERENCES.email,
      push: pref.push ?? DEFAULT_PREFERENCES.push,
      inApp: pref.inApp ?? DEFAULT_PREFERENCES.inApp,
      privacy: pref.privacy ?? DEFAULT_PREFERENCES.privacy,
    };
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const current = await this.getPreferences(userId);
    const privacy = {
      ...(current.privacy as object),
      ...(dto.profileVisibility
        ? { profileVisibility: dto.profileVisibility }
        : {}),
      ...(dto.showActivity !== undefined
        ? { showActivity: dto.showActivity }
        : {}),
    };
    const data = {
      email: dto.email ?? current.email,
      push: dto.push ?? current.push,
      inApp: dto.inApp ?? current.inApp,
      privacy,
    };
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.getPreferences(userId);
  }

  async setAvatar(userId: string, file: UploadedAvatar) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const key = `avatars/${file.filename}`;
    const avatarUrl = `${this.appUrl}/uploads/${key}`;

    await this.prisma.$transaction([
      this.prisma.mediaAsset.create({
        data: {
          ownerId: userId,
          kind: 'image',
          bucket: 'local',
          key,
          mime: file.mimetype,
          sizeBytes: BigInt(file.size),
          status: 'ready',
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl },
      }),
    ]);

    return { avatarUrl };
  }
}
