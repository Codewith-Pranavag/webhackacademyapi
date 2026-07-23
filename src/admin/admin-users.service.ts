import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { primaryRole } from '../common/user.mapper';
import type { Paginated } from '../common/dto/pagination.dto';
import type {
  InviteUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './dto/admin-users.dto';

const ROW_INCLUDE = {
  roles: { include: { role: true } },
  _count: { select: { enrollments: true, courses: true } },
} as const;

type UserRow = Prisma.UserGetPayload<{ include: typeof ROW_INCLUDE }>;

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  roles: string[];
  status: string;
  enrollments: number;
  courses: number;
  joinedAt: Date;
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUsersQueryDto): Promise<Paginated<AdminUserRow>> {
    const { page = 1, pageSize = 20, q, role, status } = query;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(role ? { roles: { some: { role: { key: role } } } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: ROW_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: items.map((u) => this.toRow(u)), total, page, pageSize };
  }

  async get(id: string): Promise<AdminUserRow> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: ROW_INCLUDE,
    });
    if (!user) throw new NotFoundException('User not found.');
    return this.toRow(user);
  }

  async invite(dto: InviteUserDto): Promise<AdminUserRow> {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('A user with that email already exists.');

    const user = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.upsert({
        where: { key: dto.role },
        update: {},
        create: { key: dto.role, name: capitalize(dto.role) },
      });
      return tx.user.create({
        data: {
          name: dto.name ?? email.split('@')[0],
          email,
          status: 'invited',
          roles: { create: { roleId: role.id } },
        },
        include: ROW_INCLUDE,
      });
    });
    // A real impl enqueues an invitation email here.
    return this.toRow(user);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actingUserId: string,
  ): Promise<AdminUserRow> {
    if (!dto.role && !dto.status) {
      throw new BadRequestException('Nothing to update.');
    }
    if (id === actingUserId) {
      throw new ForbiddenException('Admins cannot change their own role or status.');
    }

    const target = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: ROW_INCLUDE,
    });
    if (!target) throw new NotFoundException('User not found.');

    const user = await this.prisma.$transaction(async (tx) => {
      if (dto.status) {
        await tx.user.update({ where: { id }, data: { status: dto.status } });
      }
      if (dto.role) {
        const role = await tx.role.upsert({
          where: { key: dto.role },
          update: {},
          create: { key: dto.role, name: capitalize(dto.role) },
        });
        // Single-role model: replace any existing role assignments.
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.create({ data: { userId: id, roleId: role.id } });
      }
      return tx.user.findFirstOrThrow({ where: { id }, include: ROW_INCLUDE });
    });

    return this.toRow(user);
  }

  private toRow(user: UserRow): AdminUserRow {
    const roles = user.roles.map((ur) => ur.role.key);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatarUrl ?? undefined,
      role: primaryRole(roles),
      roles,
      status: user.status,
      enrollments: user._count.enrollments,
      courses: user._count.courses,
      joinedAt: user.createdAt,
    };
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
