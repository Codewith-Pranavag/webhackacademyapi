import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugify, randomSuffix } from '../common/slug.util';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { courses: true } } },
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon ?? undefined,
      parentId: c.parentId ?? undefined,
      courses: c._count.courses,
    }));
  }

  async create(dto: CreateCategoryDto) {
    const slug = await this.uniqueSlug(dto.name);
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) throw new BadRequestException('Parent category not found.');
    }
    return this.prisma.category.create({
      data: { name: dto.name, slug, icon: dto.icon, parentId: dto.parentId },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.getOrThrow(id);
    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        icon: dto.icon,
        ...(dto.name ? { slug: await this.uniqueSlug(dto.name, id) } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.getOrThrow(id);
    const count = await this.prisma.course.count({ where: { categoryId: id } });
    if (count > 0) {
      throw new ConflictException(
        `Cannot delete a category with ${count} course(s). Reassign them first.`,
      );
    }
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }

  private async getOrThrow(id: string) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Category not found.');
    return c;
  }

  private async uniqueSlug(name: string, excludeId?: string): Promise<string> {
    let slug = slugify(name);
    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) slug = `${slug}-${randomSuffix()}`;
    return slug;
  }
}
