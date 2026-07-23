import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type {
  AddResourceLinkDto,
  CreateLessonDto,
  CreateSectionDto,
  UpdateLessonDto,
  UpdateSectionDto,
} from './dto/curriculum.dto';

interface UploadedResource {
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class CurriculumService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------- Sections
  async createSection(courseId: string, user: AuthUser, dto: CreateSectionDto) {
    await this.assertCourseOwner(courseId, user);
    const count = await this.prisma.module.count({ where: { courseId } });
    return this.prisma.module.create({
      data: { courseId, title: dto.title, position: count + 1 },
    });
  }

  async updateSection(id: string, user: AuthUser, dto: UpdateSectionDto) {
    const section = await this.getSection(id);
    await this.assertCourseOwner(section.courseId, user);
    return this.prisma.module.update({ where: { id }, data: { title: dto.title } });
  }

  async deleteSection(id: string, user: AuthUser) {
    const section = await this.getSection(id);
    await this.assertCourseOwner(section.courseId, user);
    await this.prisma.module.delete({ where: { id } });
    await this.recomputeDuration(section.courseId);
    return { ok: true };
  }

  async reorderSections(courseId: string, user: AuthUser, ids: string[]) {
    await this.assertCourseOwner(courseId, user);
    const modules = await this.prisma.module.findMany({
      where: { courseId },
      select: { id: true },
    });
    this.assertSameSet(modules.map((m) => m.id), ids);
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.module.update({ where: { id }, data: { position: index + 1 } }),
      ),
    );
    return this.listSections(courseId);
  }

  async listSectionsForOwner(courseId: string, user: AuthUser) {
    await this.assertCourseOwner(courseId, user);
    return this.listSections(courseId);
  }

  async listSections(courseId: string) {
    return this.prisma.module.findMany({
      where: { courseId },
      orderBy: { position: 'asc' },
      include: {
        lessons: {
          orderBy: { position: 'asc' },
          include: { resources: true },
        },
      },
    });
  }

  // --------------------------------------------------------------- Lessons
  async createLesson(moduleId: string, user: AuthUser, dto: CreateLessonDto) {
    const section = await this.getSection(moduleId);
    await this.assertCourseOwner(section.courseId, user);
    const count = await this.prisma.lesson.count({ where: { moduleId } });
    const lesson = await this.prisma.lesson.create({
      data: {
        moduleId,
        title: dto.title,
        type: dto.type ?? 'video',
        position: count + 1,
        durationSeconds: dto.durationSeconds ?? 0,
        isPreview: dto.isPreview ?? false,
        videoUrl: dto.videoUrl,
        transcript: dto.transcript,
        contentMd: dto.contentMd,
      },
    });
    await this.recomputeDuration(section.courseId);
    return lesson;
  }

  async getLesson(id: string, user: AuthUser) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { resources: true, module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found.');
    await this.assertCourseOwner(lesson.module.courseId, user);
    return lesson;
  }

  async updateLesson(id: string, user: AuthUser, dto: UpdateLessonDto) {
    const lesson = await this.getLessonWithCourse(id);
    await this.assertCourseOwner(lesson.module.courseId, user);
    const updated = await this.prisma.lesson.update({
      where: { id },
      data: {
        title: dto.title,
        type: dto.type,
        durationSeconds: dto.durationSeconds,
        isPreview: dto.isPreview,
        videoUrl: dto.videoUrl,
        transcript: dto.transcript,
        contentMd: dto.contentMd,
      },
      include: { resources: true },
    });
    if (dto.durationSeconds !== undefined) {
      await this.recomputeDuration(lesson.module.courseId);
    }
    return updated;
  }

  async deleteLesson(id: string, user: AuthUser) {
    const lesson = await this.getLessonWithCourse(id);
    await this.assertCourseOwner(lesson.module.courseId, user);
    await this.prisma.lesson.delete({ where: { id } });
    await this.recomputeDuration(lesson.module.courseId);
    return { ok: true };
  }

  async reorderLessons(moduleId: string, user: AuthUser, ids: string[]) {
    const section = await this.getSection(moduleId);
    await this.assertCourseOwner(section.courseId, user);
    const lessons = await this.prisma.lesson.findMany({
      where: { moduleId },
      select: { id: true },
    });
    this.assertSameSet(lessons.map((l) => l.id), ids);
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.lesson.update({ where: { id }, data: { position: index + 1 } }),
      ),
    );
    return this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { position: 'asc' },
    });
  }

  // ------------------------------------------------------------ Attachments
  async addResourceFile(lessonId: string, user: AuthUser, file: UploadedResource, label?: string) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const lesson = await this.getLessonWithCourse(lessonId);
    await this.assertCourseOwner(lesson.module.courseId, user);

    const key = `resources/${file.filename}`;
    return this.prisma.$transaction(async (tx) => {
      const media = await tx.mediaAsset.create({
        data: {
          ownerId: user.sub,
          kind: mediaKind(file.mimetype),
          bucket: 'local',
          key,
          mime: file.mimetype,
          sizeBytes: BigInt(file.size),
          status: 'ready',
        },
      });
      return tx.lessonResource.create({
        data: {
          lessonId,
          label: label?.trim() || file.originalname,
          mediaAssetId: media.id,
          sizeBytes: BigInt(file.size),
        },
      });
    });
  }

  async addResourceLink(lessonId: string, user: AuthUser, dto: AddResourceLinkDto) {
    const lesson = await this.getLessonWithCourse(lessonId);
    await this.assertCourseOwner(lesson.module.courseId, user);
    return this.prisma.$transaction(async (tx) => {
      const media = await tx.mediaAsset.create({
        data: {
          ownerId: user.sub,
          kind: 'doc',
          bucket: 'external',
          key: dto.url,
          status: 'ready',
        },
      });
      return tx.lessonResource.create({
        data: { lessonId, label: dto.label, mediaAssetId: media.id, sizeBytes: BigInt(0) },
      });
    });
  }

  async removeResource(lessonId: string, resourceId: string, user: AuthUser) {
    const lesson = await this.getLessonWithCourse(lessonId);
    await this.assertCourseOwner(lesson.module.courseId, user);
    const resource = await this.prisma.lessonResource.findFirst({
      where: { id: resourceId, lessonId },
    });
    if (!resource) throw new NotFoundException('Resource not found.');
    await this.prisma.lessonResource.delete({ where: { id: resourceId } });
    return { ok: true };
  }

  // ------------------------------------------------------------------ Helpers
  private async getSection(id: string) {
    const section = await this.prisma.module.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('Section not found.');
    return section;
  }

  private async getLessonWithCourse(id: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found.');
    return lesson;
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

  private assertSameSet(actual: string[], provided: string[]) {
    const a = new Set(actual);
    const b = new Set(provided);
    if (a.size !== b.size || provided.length !== actual.length) {
      throw new BadRequestException('Reorder must include exactly the existing items.');
    }
    for (const id of provided) {
      if (!a.has(id)) {
        throw new BadRequestException('Reorder contains an item that does not belong here.');
      }
    }
  }

  private async recomputeDuration(courseId: string) {
    const agg = await this.prisma.lesson.aggregate({
      where: { module: { courseId } },
      _sum: { durationSeconds: true },
    });
    await this.prisma.course.update({
      where: { id: courseId },
      data: { durationSeconds: agg._sum.durationSeconds ?? 0 },
    });
  }
}

function mediaKind(mime: string): 'video' | 'image' | 'pdf' | 'archive' | 'doc' {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (/zip|compressed|x-7z|x-rar/.test(mime)) return 'archive';
  return 'doc';
}
