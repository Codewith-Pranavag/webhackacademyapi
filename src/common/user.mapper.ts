import { Prisma } from '@prisma/client';
import type { AppRole } from '../auth/decorators/roles.decorator';

export const USER_INCLUDE = {
  roles: { include: { role: true } },
} as const;

export type UserWithRoles = Prisma.UserGetPayload<{
  include: typeof USER_INCLUDE;
}>;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: AppRole;
  roles: string[];
  headline?: string;
  bio?: string;
  location?: string;
  skills: string[];
  emailVerified: boolean;
  joinedAt: Date;
}

export function primaryRole(roles: string[]): AppRole {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('instructor')) return 'instructor';
  return 'student';
}

export function toPublicUser(user: UserWithRoles): PublicUser {
  const roles = user.roles.map((ur) => ur.role.key);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatarUrl ?? undefined,
    role: primaryRole(roles),
    roles,
    headline: user.headline ?? undefined,
    bio: user.bio ?? undefined,
    location: user.location ?? undefined,
    skills: user.skills,
    emailVerified: Boolean(user.emailVerifiedAt),
    joinedAt: user.createdAt,
  };
}
