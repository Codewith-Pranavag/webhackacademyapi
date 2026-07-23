import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { Env } from '../config/env.validation';

const CERT_INCLUDE = {
  course: { select: { title: true, slug: true, category: { select: { name: true } } } },
  user: { select: { name: true } },
} as const;

type CertWithRefs = Prisma.CertificateGetPayload<{ include: typeof CERT_INCLUDE }>;

@Injectable()
export class CertificateService {
  private readonly secret: string;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('JWT_SECRET', { infer: true });
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  /** Issue (idempotent) a certificate for a completed course. */
  async issueForCourse(user: AuthUser, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.sub, courseId } },
    });
    if (!enrollment) throw new ForbiddenException('You are not enrolled in this course.');
    if (enrollment.status !== 'completed') {
      throw new BadRequestException('Complete the course to earn its certificate.');
    }
    const cert = await this.ensureCertificate(user.sub, courseId);
    return this.toCard(cert);
  }

  /** List my certificates, lazily issuing for any completed course missing one. */
  async myCertificates(user: AuthUser) {
    const completed = await this.prisma.enrollment.findMany({
      where: { userId: user.sub, status: 'completed' },
      select: { courseId: true },
    });
    for (const e of completed) {
      await this.ensureCertificate(user.sub, e.courseId);
    }
    const certs = await this.prisma.certificate.findMany({
      where: { userId: user.sub },
      orderBy: { issuedAt: 'desc' },
      include: CERT_INCLUDE,
    });
    return certs.map((c) => this.toCard(c));
  }

  async getOne(user: AuthUser, id: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { id },
      include: CERT_INCLUDE,
    });
    if (!cert) throw new NotFoundException('Certificate not found.');
    if (cert.userId !== user.sub && !user.roles.includes('admin')) {
      throw new ForbiddenException('Not your certificate.');
    }
    return this.toCard(cert);
  }

  /** Public verification by credential id. */
  async verify(credentialId: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { credentialId },
      include: CERT_INCLUDE,
    });
    if (!cert) return { valid: false as const };
    const expected = this.hash(cert.userId, cert.courseId, cert.credentialId, cert.issuedAt);
    const valid = expected === cert.verificationHash;
    return {
      valid,
      credentialId: cert.credentialId,
      learnerName: cert.user.name,
      courseTitle: cert.course.title,
      grade: cert.grade ?? undefined,
      issuedAt: cert.issuedAt,
    };
  }

  // ------------------------------------------------------------------ Helpers
  private async ensureCertificate(userId: string, courseId: string): Promise<CertWithRefs> {
    const existing = await this.prisma.certificate.findUnique({
      where: { userId_courseId: { userId, courseId } },
      include: CERT_INCLUDE,
    });
    if (existing) return existing;

    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { slug: true },
    });
    const issuedAt = new Date();
    const credentialId = this.makeCredentialId(course.slug, issuedAt);
    const grade = await this.computeGrade(userId, courseId);
    const verificationHash = this.hash(userId, courseId, credentialId, issuedAt);

    return this.prisma.certificate.create({
      data: { userId, courseId, credentialId, grade, issuedAt, verificationHash },
      include: CERT_INCLUDE,
    });
  }

  private async computeGrade(userId: string, courseId: string): Promise<string> {
    const quizzes = await this.prisma.quiz.findMany({
      where: { courseId },
      select: { id: true },
    });
    if (quizzes.length === 0) return 'Completed';

    let sum = 0;
    let count = 0;
    for (const q of quizzes) {
      const best = await this.prisma.quizAttempt.aggregate({
        where: { quizId: q.id, userId, submittedAt: { not: null } },
        _max: { score: true },
      });
      if (best._max.score != null) {
        sum += best._max.score;
        count += 1;
      }
    }
    if (count === 0) return 'Completed';
    const avg = Math.round(sum / count);
    if (avg >= 90) return 'Distinction';
    if (avg >= 75) return 'Merit';
    return 'Pass';
  }

  private makeCredentialId(slug: string, issuedAt: Date): string {
    const code = (slug.replace(/[^a-z]/gi, '').slice(0, 3) || 'crs').toUpperCase();
    const rand = randomBytes(3).toString('hex').toUpperCase();
    return `WHA-${issuedAt.getFullYear()}-${code}-${rand}`;
  }

  private hash(userId: string, courseId: string, credentialId: string, issuedAt: Date): string {
    const payload = `${userId}|${courseId}|${credentialId}|${issuedAt.toISOString()}`;
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  private toCard(cert: CertWithRefs) {
    return {
      id: cert.id,
      credentialId: cert.credentialId,
      courseId: cert.courseId,
      courseTitle: cert.course.title,
      category: cert.course.category?.name ?? undefined,
      recipient: cert.user.name,
      grade: cert.grade ?? undefined,
      issuedAt: cert.issuedAt,
      verifyUrl: `${this.appUrl}/v1/certificates/verify/${cert.credentialId}`,
    };
  }
}
