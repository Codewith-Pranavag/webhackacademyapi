import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const LESSON_TYPES = ['video', 'reading', 'quiz'] as const;
export type LessonTypeDto = (typeof LESSON_TYPES)[number];

/* ------------------------------------------------------------------ Sections */
export class CreateSectionDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;
}

export class UpdateSectionDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;
}

/* ------------------------------------------------------------------- Lessons */
export class CreateLessonDto {
  @ApiProperty({ minLength: 2, maxLength: 160 })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional({ enum: LESSON_TYPES, default: 'video' })
  @IsOptional()
  @IsIn(LESSON_TYPES)
  type?: LessonTypeDto;

  @ApiPropertyOptional({ minimum: 0, maximum: 86400, description: 'Duration in seconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400)
  durationSeconds?: number;

  @ApiPropertyOptional({ description: 'External video URL (Vimeo/Mux/YouTube/etc.)' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  videoUrl?: string;

  @ApiPropertyOptional({ default: false, description: 'Free preview' })
  @IsOptional()
  @IsBoolean()
  isPreview?: boolean;

  @ApiPropertyOptional({ maxLength: 20000 })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  transcript?: string;

  @ApiPropertyOptional({ maxLength: 50000, description: 'Markdown content for reading lessons' })
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  contentMd?: string;
}

export class UpdateLessonDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ enum: LESSON_TYPES })
  @IsOptional()
  @IsIn(LESSON_TYPES)
  type?: LessonTypeDto;

  @ApiPropertyOptional({ minimum: 0, maximum: 86400 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400)
  durationSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  videoUrl?: string;

  @ApiPropertyOptional({ description: 'Toggle free preview' })
  @IsOptional()
  @IsBoolean()
  isPreview?: boolean;

  @ApiPropertyOptional({ maxLength: 20000 })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  transcript?: string;

  @ApiPropertyOptional({ maxLength: 50000 })
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  contentMd?: string;
}

/* ------------------------------------------------------------------- Ordering */
export class ReorderDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Ids in the new order' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  ids!: string[];
}

/* ---------------------------------------------------------------- Attachments */
export class AddResourceLinkDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  label!: string;

  @ApiProperty({ description: 'External resource URL' })
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  url!: string;
}
