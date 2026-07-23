import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify, randomSuffix } from '../common/slug.util';
import type { Paginated } from '../common/dto/pagination.dto';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type {
  CreateCourseDto,
  ListCoursesQueryDto,
  SetPricingDto,
  UpdateCourseDto,
} from './dto/course.dto';

const INSTRUCTOR_SELECT = {
  select: { id: true, name: true, avatarUrl: true, headline: true },
} as const;

const COMMON_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  instructor: INSTRUCTOR_SELECT,
  _count: { select: { enrollments: true } },
} as const;

type CourseCommon = Prisma.CourseGetPayload<{ include: typeof COMMON_INCLUDE }>;

type ModuleCount = { _count: { lessons: number } };
type CurriculumModule = {
  id: string;
  title: string;
  lessons: {
    id: string;
    title: string;
    type: string;
    durationSeconds: number;
    isPreview: boolean;
  }[];
};

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------ Create
  async create(user: AuthUser, dto: CreateCourseDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new BadRequestException('Category not found.');

    const course = await this.prisma.course.create({
      data: {
        title: dto.title,
        slug: await this.uniqueSlug(dto.title),
        subtitle: dto.subtitle,
        description: dto.description,
        outcomes: dto.outcomes ?? [],
        requirements: dto.requirements ?? [],
        categoryId: dto.categoryId,
        instructorId: user.sub,
        level: dto.level ?? 'beginner',
        priceCents: dto.priceCents ?? 0,
        currency: dto.currency ?? 'USD',
        status: 'draft',
      },
      include: COMMON_INCLUDE,
    });
    return this.toDetail(course, []);
  }

  // ------------------------------------------------------------------ Update
  async update(id: string, user: AuthUser, dto: UpdateCourseDto) {
    const course = await this.getManageable(id, user);
    if (dto.categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!cat) throw new BadRequestException('Category not found.');
    }
    const updated = await this.prisma.course.update({
      where: { id: course.id },
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        description: dto.description,
        outcomes: dto.outcomes,
        requirements: dto.requirements,
        level: dto.level,
        categoryId: dto.categoryId,
        ...(dto.title && dto.title !== course.title
          ? { slug: await this.uniqueSlug(dto.title, course.id) }
          : {}),
      },
      include: COMMON_INCLUDE,
    });
    return this.toDetail(updated, []);
  }

  // ------------------------------------------------------------------ Pricing
  async setPricing(id: string, user: AuthUser, dto: SetPricingDto) {
    const course = await this.getManageable(id, user);
    const updated = await this.prisma.course.update({
      where: { id: course.id },
      data: { priceCents: dto.priceCents, currency: dto.currency ?? course.currency },
      include: COMMON_INCLUDE,
    });
    return this.toDetail(updated, []);
  }

  // ------------------------------------------------------------------ Delete
  async remove(id: string, user: AuthUser) {
    const course = await this.getManageable(id, user);
    await this.prisma.course.update({
      where: { id: course.id },
      data: { deletedAt: new Date(), status: 'archived' },
    });
    return { ok: true };
  }

  // --------------------------------------------------------- Publish workflow
  async submit(id: string, user: AuthUser) {
    const course = await this.getManageable(id, user);
    if (course.status === 'published') {
      throw new BadRequestException('Course is already published.');
    }
    return this.setStatus(course.id, 'in_review');
  }

  async publish(id: string, user: AuthUser) {
    const course = await this.getManageable(id, user);
    if (!course.description || course.description.trim().length < 20) {
      throw new BadRequestException('Add a description (20+ chars) before publishing.');
    }
    const updated = await this.prisma.course.update({
      where: { id: course.id },
      data: { status: 'published', publishedAt: course.publishedAt ?? new Date() },
      include: COMMON_INCLUDE,
    });
    return this.toDetail(updated, []);
  }

  async unpublish(id: string, user: AuthUser) {
    const course = await this.getManageable(id, user);
    return this.setStatus(course.id, 'draft');
  }

  // -------------------------------------------------------------------- Reads
  async list(query: ListCoursesQueryDto): Promise<Paginated<CourseSummary>> {
    const { page = 1, pageSize = 12, q, level, price, sort = 'newest' } = query;

    let categoryId: string | undefined;
    if (query.category) {
      const cat = await this.prisma.category.findFirst({
        where: {
          OR: [
            { slug: query.category },
            ...(isUuid(query.category) ? [{ id: query.category }] : []),
          ],
        },
        select: { id: true },
      });
      categoryId = cat?.id ?? '__none__';
    }

    const where: Prisma.CourseWhereInput = {
      status: 'published',
      deletedAt: null,
      ...(categoryId ? { categoryId } : {}),
      ...(level ? { level } : {}),
      ...(price === 'free' ? { priceCents: 0 } : {}),
      ...(price === 'paid' ? { priceCents: { gt: 0 } } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        orderBy: this.orderBy(sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { ...COMMON_INCLUDE, modules: { select: { _count: { select: { lessons: true } } } } },
      }),
      this.prisma.course.count({ where }),
    ]);

    return {
      items: items.map((c) => this.toSummary(c, countLessons(c.modules))),
      total,
      page,
      pageSize,
    };
  }

  /** Public course landing page (published only). */
  async landing(slug: string) {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: 'published', deletedAt: null },
      include: this.curriculumInclude(),
    });
    if (!course) throw new NotFoundException('Course not found.');
    return this.toDetail(course, course.modules);
  }

  /** Owner/admin view of a single course (any status) for the edit page. */
  async manage(id: string, user: AuthUser) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
      include: this.curriculumInclude(),
    });
    if (!course) throw new NotFoundException('Course not found.');
    if (!user.roles.includes('admin') && course.instructorId !== user.sub) {
      throw new ForbiddenException('You do not own this course.');
    }
    return this.toDetail(course, course.modules);
  }

  /** Instructor's own courses (all statuses). */
  async mine(user: AuthUser): Promise<CourseSummary[]> {
    const items = await this.prisma.course.findMany({
      where: { instructorId: user.sub, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: { ...COMMON_INCLUDE, modules: { select: { _count: { select: { lessons: true } } } } },
    });
    return items.map((c) => this.toSummary(c, countLessons(c.modules)));
  }

  // ------------------------------------------------------------------ Helpers
  private async setStatus(
    id: string,
    status: 'draft' | 'in_review' | 'published' | 'archived',
  ) {
    const updated = await this.prisma.course.update({
      where: { id },
      data: { status },
      include: COMMON_INCLUDE,
    });
    return this.toDetail(updated, []);
  }

  private async getManageable(id: string, user: AuthUser) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
      include: COMMON_INCLUDE,
    });
    if (!course) throw new NotFoundException('Course not found.');
    if (!user.roles.includes('admin') && course.instructorId !== user.sub) {
      throw new ForbiddenException('You do not own this course.');
    }
    return course;
  }

  private curriculumInclude() {
    return {
      ...COMMON_INCLUDE,
      modules: {
        orderBy: { position: 'asc' as const },
        include: {
          lessons: {
            orderBy: { position: 'asc' as const },
            select: {
              id: true,
              title: true,
              type: true,
              durationSeconds: true,
              isPreview: true,
            },
          },
        },
      },
    } satisfies Prisma.CourseInclude;
  }

  private orderBy(sort: string): Prisma.CourseOrderByWithRelationInput {
    switch (sort) {
      case 'rating':
        return { ratingAvg: 'desc' };
      case 'popular':
        return { enrollments: { _count: 'desc' } };
      case 'price_asc':
        return { priceCents: 'asc' };
      case 'price_desc':
        return { priceCents: 'desc' };
      default:
        return { publishedAt: 'desc' };
    }
  }

  private toSummary(c: CourseCommon, lessons: number): CourseSummary {
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      subtitle: c.subtitle ?? undefined,
      category: c.category
        ? { name: c.category.name, slug: c.category.slug }
        : undefined,
      level: c.level,
      status: c.status,
      priceCents: c.priceCents,
      currency: c.currency,
      price: priceDisplay(c.priceCents, c.currency),
      rating: Number(c.ratingAvg),
      reviews: c.ratingCount,
      students: c._count.enrollments,
      lessons,
      durationHours: Math.round(c.durationSeconds / 360) / 10,
      instructor: {
        id: c.instructor.id,
        name: c.instructor.name,
        avatar: c.instructor.avatarUrl ?? undefined,
      },
      updatedAt: c.updatedAt,
    };
  }

  private toDetail(
    c: CourseCommon,
    modules: ModuleCount[] | CurriculumModule[],
  ): CourseDetail {
    const hasCurriculum = modules.length > 0 && 'lessons' in modules[0];
    const lessons = hasCurriculum
      ? (modules as CurriculumModule[]).reduce((n, m) => n + m.lessons.length, 0)
      : countLessons(modules as ModuleCount[]);

    return {
      ...this.toSummary(c, lessons),
      description: c.description ?? undefined,
      outcomes: c.outcomes,
      requirements: c.requirements,
      publishedAt: c.publishedAt ?? undefined,
      instructor: {
        id: c.instructor.id,
        name: c.instructor.name,
        avatar: c.instructor.avatarUrl ?? undefined,
        headline: c.instructor.headline ?? undefined,
      },
      ...(hasCurriculum
        ? {
            modules: (modules as CurriculumModule[]).map((m) => ({
              id: m.id,
              title: m.title,
              lessons: m.lessons.map((l) => ({
                id: l.id,
                title: l.title,
                type: l.type,
                duration: l.durationSeconds,
                preview: l.isPreview,
              })),
            })),
          }
        : {}),
    };
  }

  private async uniqueSlug(title: string, excludeId?: string): Promise<string> {
    let slug = slugify(title);
    const existing = await this.prisma.course.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) slug = `${slug}-${randomSuffix()}`;
    return slug;
  }
}

// ---------------------------------------------------------------- Return types
export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  category?: { name: string; slug: string };
  level: string;
  status: string;
  priceCents: number;
  currency: string;
  price: string;
  rating: number;
  reviews: number;
  students: number;
  lessons: number;
  durationHours: number;
  instructor: { id: string; name: string; avatar?: string };
  updatedAt: Date;
}

export interface CourseDetail extends CourseSummary {
  description?: string;
  outcomes: string[];
  requirements: string[];
  publishedAt?: Date;
  instructor: { id: string; name: string; avatar?: string; headline?: string };
  modules?: {
    id: string;
    title: string;
    lessons: { id: string; title: string; type: string; duration: number; preview: boolean }[];
  }[];
}

function countLessons(modules: ModuleCount[]): number {
  return modules.reduce((n, m) => n + m._count.lessons, 0);
}

function priceDisplay(cents: number, currency: string): string {
  if (cents === 0) return 'Free';
  const amount = cents / 100;
  if (currency === 'USD') return `$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  return `${currency} ${amount.toFixed(2)}`;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
