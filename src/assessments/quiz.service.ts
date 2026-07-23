import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type {
  CreateQuestionDto,
  CreateQuizDto,
  QuestionTypeDto,
  SubmitQuizDto,
  UpdateQuestionDto,
  UpdateQuizDto,
} from './dto/quiz.dto';

const GRACE_SECONDS = 15;

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================== Authoring
  async createQuiz(courseId: string, user: AuthUser, dto: CreateQuizDto) {
    await this.assertCourseOwner(courseId, user);
    return this.prisma.quiz.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description,
        durationMinutes: dto.durationMinutes ?? 15,
        passingScore: dto.passingScore ?? 70,
        maxAttempts: dto.maxAttempts,
        shuffle: dto.shuffle ?? false,
      },
    });
  }

  async updateQuiz(id: string, user: AuthUser, dto: UpdateQuizDto) {
    const quiz = await this.getQuiz(id);
    await this.assertCourseOwner(quiz.courseId, user);
    return this.prisma.quiz.update({ where: { id }, data: dto });
  }

  async deleteQuiz(id: string, user: AuthUser) {
    const quiz = await this.getQuiz(id);
    await this.assertCourseOwner(quiz.courseId, user);
    await this.prisma.quiz.delete({ where: { id } });
    return { ok: true };
  }

  /** Owner/admin view — includes correct answers + explanations. */
  async manageQuiz(id: string, user: AuthUser) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: { questions: { orderBy: { position: 'asc' } } },
    });
    if (!quiz) throw new NotFoundException('Quiz not found.');
    await this.assertCourseOwner(quiz.courseId, user);
    return quiz;
  }

  async addQuestion(quizId: string, user: AuthUser, dto: CreateQuestionDto) {
    const quiz = await this.getQuiz(quizId);
    await this.assertCourseOwner(quiz.courseId, user);

    const { options, correct } = this.validateQuestion(dto.type, dto);
    const count = await this.prisma.quizQuestion.count({ where: { quizId } });

    return this.prisma.quizQuestion.create({
      data: {
        quizId,
        type: dto.type,
        prompt: dto.prompt,
        options: options ?? Prisma.JsonNull,
        correct,
        explanation: dto.explanation,
        points: dto.points,
        position: count + 1,
      },
    });
  }

  async updateQuestion(id: string, user: AuthUser, dto: UpdateQuestionDto) {
    const question = await this.prisma.quizQuestion.findUnique({
      where: { id },
      include: { quiz: { select: { courseId: true } } },
    });
    if (!question) throw new NotFoundException('Question not found.');
    await this.assertCourseOwner(question.quiz.courseId, user);

    // Re-validate correctness shape if options/correct change.
    let correct: Prisma.InputJsonValue | undefined;
    let options: Prisma.InputJsonValue | undefined;
    if (dto.options || dto.correctIndices || dto.correctText !== undefined) {
      const merged = this.validateQuestion(question.type as QuestionTypeDto, {
        options: dto.options ?? (question.options as string[] | undefined),
        correctIndices: dto.correctIndices,
        correctText: dto.correctText,
      });
      correct = merged.correct;
      options = merged.options ?? undefined;
    }

    return this.prisma.quizQuestion.update({
      where: { id },
      data: {
        prompt: dto.prompt,
        explanation: dto.explanation,
        points: dto.points,
        ...(options !== undefined ? { options } : {}),
        ...(correct !== undefined ? { correct } : {}),
      },
    });
  }

  async deleteQuestion(id: string, user: AuthUser) {
    const question = await this.prisma.quizQuestion.findUnique({
      where: { id },
      include: { quiz: { select: { courseId: true } } },
    });
    if (!question) throw new NotFoundException('Question not found.');
    await this.assertCourseOwner(question.quiz.courseId, user);
    await this.prisma.quizQuestion.delete({ where: { id } });
    return { ok: true };
  }

  // ================================================================ Taking
  async listForCourse(courseId: string, user: AuthUser) {
    await this.assertEnrolledOrPrivileged(courseId, user);
    const quizzes = await this.prisma.quiz.findMany({
      where: { courseId },
      include: { _count: { select: { questions: true } } },
    });
    return quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description ?? undefined,
      durationMinutes: q.durationMinutes,
      passingScore: q.passingScore,
      maxAttempts: q.maxAttempts ?? undefined,
      questions: q._count.questions,
    }));
  }

  /** Student take-view — NO correct answers or explanations. */
  async getForTaking(id: string, user: AuthUser) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: { questions: { orderBy: { position: 'asc' } } },
    });
    if (!quiz) throw new NotFoundException('Quiz not found.');
    await this.assertEnrolledOrPrivileged(quiz.courseId, user);

    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description ?? undefined,
      durationMinutes: quiz.durationMinutes,
      passingScore: quiz.passingScore,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        options: (q.options as string[] | null) ?? undefined,
        points: q.points,
      })),
    };
  }

  async startAttempt(quizId: string, user: AuthUser) {
    const quiz = await this.getQuiz(quizId);
    await this.assertEnrolledOrPrivileged(quiz.courseId, user);

    if (quiz.maxAttempts) {
      const used = await this.prisma.quizAttempt.count({
        where: { quizId, userId: user.sub, submittedAt: { not: null } },
      });
      if (used >= quiz.maxAttempts) {
        throw new ForbiddenException('You have used all your attempts.');
      }
    }

    const attempt = await this.prisma.quizAttempt.create({
      data: { quizId, userId: user.sub },
    });
    return {
      attemptId: attempt.id,
      startedAt: attempt.startedAt,
      endsAt: new Date(attempt.startedAt.getTime() + quiz.durationMinutes * 60_000),
      durationMinutes: quiz.durationMinutes,
    };
  }

  async submitAttempt(
    quizId: string,
    attemptId: string,
    user: AuthUser,
    dto: SubmitQuizDto,
  ) {
    const attempt = await this.prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.quizId !== quizId) {
      throw new NotFoundException('Attempt not found.');
    }
    if (attempt.userId !== user.sub) throw new ForbiddenException('Not your attempt.');
    if (attempt.submittedAt) throw new BadRequestException('Attempt already submitted.');

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: { orderBy: { position: 'asc' } } },
    });
    if (!quiz) throw new NotFoundException('Quiz not found.');

    // Server-authoritative timing.
    const deadline = attempt.startedAt.getTime() + quiz.durationMinutes * 60_000;
    const lateBy = Date.now() - (deadline + GRACE_SECONDS * 1000);
    // (We still grade after the deadline, but flag it — no partial credit for time.)

    const totalPoints = quiz.questions.reduce((s, q) => s + q.points, 0) || 1;
    let earned = 0;
    const breakdown = quiz.questions.map((q) => {
      const given = dto.answers[q.id];
      const correct = this.isCorrect(q.type as QuestionTypeDto, q.correct, given);
      const pointsAwarded = correct ? q.points : 0;
      earned += pointsAwarded;
      return { question: q, given, correct, pointsAwarded };
    });

    const score = Math.round((earned / totalPoints) * 100);
    const passed = score >= quiz.passingScore;
    const durationSeconds = Math.round((Date.now() - attempt.startedAt.getTime()) / 1000);

    await this.prisma.$transaction([
      ...breakdown.map((b) =>
        this.prisma.quizAnswer.create({
          data: {
            attemptId,
            questionId: b.question.id,
            answer: (b.given ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            isCorrect: b.correct,
            pointsAwarded: b.pointsAwarded,
          },
        }),
      ),
      this.prisma.quizAttempt.update({
        where: { id: attemptId },
        data: { score, passed, submittedAt: new Date(), durationSeconds },
      }),
    ]);

    return {
      attemptId,
      score,
      passed,
      passingScore: quiz.passingScore,
      lateSubmission: lateBy > 0,
      breakdown: breakdown.map((b) => ({
        questionId: b.question.id,
        prompt: b.question.prompt,
        correct: b.correct,
        pointsAwarded: b.pointsAwarded,
        explanation: b.question.explanation ?? undefined,
      })),
    };
  }

  async myAttempts(quizId: string, user: AuthUser) {
    return this.prisma.quizAttempt.findMany({
      where: { quizId, userId: user.sub },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        score: true,
        passed: true,
        startedAt: true,
        submittedAt: true,
        durationSeconds: true,
      },
    });
  }

  // ============================================================ Auto-eval
  private isCorrect(
    type: QuestionTypeDto,
    correct: Prisma.JsonValue,
    given: number[] | string | undefined,
  ): boolean {
    if (given === undefined || given === null) return false;

    if (type === 'fill' || type === 'code') {
      if (typeof given !== 'string' || typeof correct !== 'string') return false;
      return type === 'code'
        ? normalizeCode(given) === normalizeCode(correct)
        : normalizeText(given) === normalizeText(correct);
    }

    // MCQ types: compare index sets.
    if (!Array.isArray(given) || !Array.isArray(correct)) return false;
    const a = new Set(given.map(Number));
    const b = new Set((correct as number[]).map(Number));
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }

  private validateQuestion(
    type: QuestionTypeDto,
    dto: { options?: string[]; correctIndices?: number[]; correctText?: string },
  ): { options: Prisma.InputJsonValue | null; correct: Prisma.InputJsonValue } {
    if (type === 'fill' || type === 'code') {
      if (!dto.correctText || !dto.correctText.trim()) {
        throw new BadRequestException(`A ${type} question needs correctText.`);
      }
      return { options: null, correct: dto.correctText };
    }

    // MCQ types
    let options = dto.options;
    if (type === 'boolean') options = options ?? ['True', 'False'];
    if (!options || options.length < 2) {
      throw new BadRequestException('MCQ questions need at least 2 options.');
    }
    const indices = dto.correctIndices ?? [];
    if (indices.length < 1) {
      throw new BadRequestException('Select at least one correct option.');
    }
    if (type !== 'multi' && indices.length !== 1) {
      throw new BadRequestException('This question type must have exactly one correct option.');
    }
    if (indices.some((i) => i < 0 || i >= options!.length)) {
      throw new BadRequestException('correctIndices out of range.');
    }
    return { options, correct: indices };
  }

  // ============================================================== Helpers
  private async getQuiz(id: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id } });
    if (!quiz) throw new NotFoundException('Quiz not found.');
    return quiz;
  }

  private async assertCourseOwner(courseId: string, user: AuthUser) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { instructorId: true },
    });
    if (!course) throw new NotFoundException('Course not found.');
    if (!user.roles.includes('admin') && course.instructorId !== user.sub) {
      throw new ForbiddenException('You do not own this course.');
    }
  }

  private async assertEnrolledOrPrivileged(courseId: string, user: AuthUser) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { instructorId: true },
    });
    if (!course) throw new NotFoundException('Course not found.');
    if (user.roles.includes('admin') || course.instructorId === user.sub) return;
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.sub, courseId } },
    });
    if (!enrollment) throw new ForbiddenException('Enroll to take this quiz.');
  }
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeCode(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}
