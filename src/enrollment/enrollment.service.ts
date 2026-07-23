import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { LessonProgressDto } from './dto/enrollment.dto';

const COURSE_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  level: true,
  priceCents: true,
  currency: true,
  status: true,
  instructor: { select: { id: true, name: true, avatarUrl: true } },
  category: { select: { name: true, slug: true } },
} as const;

@Injectable()
export class EnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------ Enroll (free)
  async enroll(user: AuthUser, courseId: string) {
    const course = await this.getEnrollableCourse(courseId);
    if (course.priceCents > 0) {
      throw new HttpException(
        'This is a paid course. Purchase it to enroll.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    await this.ensureNotEnrolled(user.sub, courseId);
    return this.createEnrollment(user.sub, courseId, 'free');
  }

  // ---------------------------------------------------- Fulfil paid purchase
  /**
   * Grant access to a paid course after payment is verified (called by the
   * payments module). Idempotent — safe to call from both the client callback
   * and the Razorpay webhook.
   */
  async fulfillPurchase(userId: string, courseId: string) {
    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      include: { course: { select: COURSE_CARD_SELECT } },
    });
    if (existing) {
      const total = await this.prisma.lesson.count({ where: { module: { courseId } } });
      const completed = Math.round((existing.progressPct / 100) * total);
      return this.toEnrollmentCard(existing, completed, total);
    }
    return this.createEnrollment(userId, courseId, 'purchase');
  }

  // ------------------------------------------------------- My Learning list
  async myEnrollments(user: AuthUser) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: user.sub },
      orderBy: { lastAccessedAt: { sort: 'desc', nulls: 'last' } },
      include: { course: { select: COURSE_CARD_SELECT } },
    });
    return this.attachLessonTotals(enrollments);
  }

  async continueLearning(user: AuthUser, limit = 4) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: user.sub, status: 'in_progress' },
      orderBy: { lastAccessedAt: { sort: 'desc', nulls: 'last' } },
      take: limit,
      include: { course: { select: COURSE_CARD_SELECT } },
    });
    return this.attachLessonTotals(enrollments);
  }

  // -------------------------------------------------------- Course player
  async getLearn(user: AuthUser, courseId: string) {
    const { enrollment } = await this.assertAccess(user, courseId);
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      include: {
        instructor: { select: { id: true, name: true, avatarUrl: true } },
        category: { select: { name: true, slug: true } },
        modules: {
          orderBy: { position: 'asc' },
          include: {
            lessons: {
              orderBy: { position: 'asc' },
              include: { resources: true },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found.');

    // Touch last-accessed + move not_started → in_progress.
    if (enrollment && enrollment.status === 'not_started') {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: 'in_progress', lastAccessedAt: new Date() },
      });
    } else if (enrollment) {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { lastAccessedAt: new Date() },
      });
    }

    const completed = new Set(
      enrollment
        ? (
            await this.prisma.lessonProgress.findMany({
              where: { enrollmentId: enrollment.id, completed: true },
              select: { lessonId: true },
            })
          ).map((p) => p.lessonId)
        : [],
    );

    const totalLessons = course.modules.reduce((n, m) => n + m.lessons.length, 0);

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      instructor: {
        id: course.instructor.id,
        name: course.instructor.name,
        avatar: course.instructor.avatarUrl ?? undefined,
      },
      progress: {
        pct: enrollment?.progressPct ?? 0,
        lastLessonId: enrollment?.lastLessonId ?? null,
        completedLessonIds: [...completed],
        totalLessons,
      },
      modules: course.modules.map((m) => ({
        id: m.id,
        title: m.title,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          type: l.type,
          duration: l.durationSeconds,
          preview: l.isPreview,
          videoUrl: l.videoUrl ?? undefined, // full access — caller is enrolled/owner
          resources: l.resources.map((r) => ({
            id: r.id,
            label: r.label,
            sizeBytes: Number(r.sizeBytes),
          })),
          completed: completed.has(l.id),
        })),
      })),
    };
  }

  // ------------------------------------------------------- Progress tracking
  async reportProgress(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    dto: LessonProgressDto,
  ) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.sub, courseId } },
    });
    if (!enrollment) throw new ForbiddenException('You are not enrolled in this course.');

    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, module: { courseId } },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found in this course.');

    const completed = dto.completed ?? undefined;
    await this.prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
      create: {
        enrollmentId: enrollment.id,
        lessonId,
        watchedSeconds: dto.watchedSeconds ?? 0,
        completed: completed ?? false,
        completedAt: completed ? new Date() : null,
      },
      update: {
        ...(dto.watchedSeconds !== undefined ? { watchedSeconds: dto.watchedSeconds } : {}),
        ...(completed !== undefined
          ? { completed, completedAt: completed ? new Date() : null }
          : {}),
      },
    });

    return this.recomputeProgress(enrollment.id, courseId, lessonId);
  }

  async getProgress(user: AuthUser, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.sub, courseId } },
      include: {
        progress: { select: { lessonId: true, completed: true, watchedSeconds: true } },
      },
    });
    if (!enrollment) throw new ForbiddenException('You are not enrolled in this course.');
    return {
      status: enrollment.status,
      progressPct: enrollment.progressPct,
      lastLessonId: enrollment.lastLessonId,
      completedLessonIds: enrollment.progress.filter((p) => p.completed).map((p) => p.lessonId),
      lessons: enrollment.progress,
    };
  }

  // ------------------------------------------------------------- Access check
  /** Enrolled student OR course owner OR admin. Returns the enrollment if any. */
  async assertAccess(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { instructorId: true },
    });
    if (!course) throw new NotFoundException('Course not found.');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.sub, courseId } },
    });

    const privileged =
      user.roles.includes('admin') || course.instructorId === user.sub;
    if (!enrollment && !privileged) {
      throw new ForbiddenException('Enroll in this course to access its content.');
    }
    return { enrollment, privileged };
  }

  // ------------------------------------------------------------------ Helpers
  private async getEnrollableCourse(courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, priceCents: true, currency: true, status: true },
    });
    if (!course) throw new NotFoundException('Course not found.');
    if (course.status !== 'published') {
      throw new BadRequestException('This course is not open for enrollment.');
    }
    return course;
  }

  private async ensureNotEnrolled(userId: string, courseId: string) {
    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) throw new ConflictException('You are already enrolled in this course.');
  }

  private async createEnrollment(
    userId: string,
    courseId: string,
    source: 'free' | 'purchase' | 'subscription',
  ) {
    const enrollment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.enrollment.create({
        data: { userId, courseId, status: 'not_started', source },
        include: { course: { select: COURSE_CARD_SELECT } },
      });
      await tx.course.update({
        where: { id: courseId },
        data: { studentsCount: { increment: 1 } },
      });
      const total = await tx.lesson.count({ where: { module: { courseId } } });
      return { created, total };
    });
    return this.toEnrollmentCard(enrollment.created, 0, enrollment.total);
  }

  private async recomputeProgress(enrollmentId: string, courseId: string, lastLessonId: string) {
    const total = await this.prisma.lesson.count({ where: { module: { courseId } } });
    const done = await this.prisma.lessonProgress.count({
      where: { enrollmentId, completed: true },
    });
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const isComplete = total > 0 && done >= total;

    const updated = await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        progressPct: pct,
        lastLessonId,
        lastAccessedAt: new Date(),
        status: isComplete ? 'completed' : 'in_progress',
        completedAt: isComplete ? new Date() : null,
      },
    });

    return {
      progressPct: updated.progressPct,
      status: updated.status,
      completedLessons: done,
      totalLessons: total,
      lastLessonId: updated.lastLessonId,
    };
  }

  private async attachLessonTotals(enrollments: EnrollmentWithCourse[]) {
    const courseIds = enrollments.map((e) => e.courseId);
    const modules = await this.prisma.module.findMany({
      where: { courseId: { in: courseIds } },
      select: { courseId: true, _count: { select: { lessons: true } } },
    });
    const totalByCourse = new Map<string, number>();
    for (const m of modules) {
      totalByCourse.set(
        m.courseId,
        (totalByCourse.get(m.courseId) ?? 0) + m._count.lessons,
      );
    }

    return enrollments.map((e) => {
      const total = totalByCourse.get(e.courseId) ?? 0;
      const completed = Math.round((e.progressPct / 100) * total);
      return this.toEnrollmentCard(e, completed, total);
    });
  }

  private toEnrollmentCard(
    e: EnrollmentWithCourse,
    completedLessons: number,
    totalLessons: number,
  ) {
    return {
      courseId: e.courseId,
      status: e.status,
      progress: e.progressPct,
      completedLessons,
      totalLessons,
      lastLessonId: e.lastLessonId,
      lastAccessedAt: e.lastAccessedAt,
      source: e.source,
      course: {
        id: e.course.id,
        slug: e.course.slug,
        title: e.course.title,
        subtitle: e.course.subtitle ?? undefined,
        level: e.course.level,
        price: priceDisplay(e.course.priceCents, e.course.currency),
        instructor: {
          id: e.course.instructor.id,
          name: e.course.instructor.name,
          avatar: e.course.instructor.avatarUrl ?? undefined,
        },
        category: e.course.category
          ? { name: e.course.category.name, slug: e.course.category.slug }
          : undefined,
      },
    };
  }
}

// ------------------------------------------------------------------- Types
type EnrollmentWithCourse = Prisma.EnrollmentGetPayload<{
  include: { course: { select: typeof COURSE_CARD_SELECT } };
}>;

function priceDisplay(cents: number, currency: string): string {
  if (cents === 0) return 'Free';
  const amount = cents / 100;
  if (currency === 'USD') return `$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  return `${currency} ${amount.toFixed(2)}`;
}
