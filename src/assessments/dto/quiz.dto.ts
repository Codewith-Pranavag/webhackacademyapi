import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const QUESTION_TYPES = ['single', 'multi', 'boolean', 'fill', 'code'] as const;
export type QuestionTypeDto = (typeof QUESTION_TYPES)[number];

export class CreateQuizDto {
  @ApiProperty({ minLength: 3, maxLength: 160 })
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 300, default: 15 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  durationMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 70 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, description: 'null = unlimited' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  shuffle?: boolean;
}

export class UpdateQuizDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 300 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  durationMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shuffle?: boolean;
}

export class CreateQuestionDto {
  @ApiProperty({ enum: QUESTION_TYPES })
  @IsIn(QUESTION_TYPES)
  type!: QuestionTypeDto;

  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  prompt!: string;

  @ApiPropertyOptional({ type: [String], description: 'Choices (MCQ types)', maxItems: 8 })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  options?: string[];

  @ApiPropertyOptional({ type: [Number], description: 'Correct option indices (MCQ types)' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  correctIndices?: number[];

  @ApiPropertyOptional({ description: 'Expected answer (fill / code)' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  correctText?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  explanation?: string;

  @ApiProperty({ minimum: 1, maximum: 100, default: 10 })
  @IsInt()
  @Min(1)
  @Max(100)
  points!: number;
}

export class UpdateQuestionDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  prompt?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  correctIndices?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  correctText?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  explanation?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  points?: number;
}

export class SubmitQuizDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: {
      oneOf: [{ type: 'array', items: { type: 'integer' } }, { type: 'string' }],
    },
    description: 'Map of questionId -> selected indices[] (MCQ) or text (fill/code)',
    example: { q1: [1], q2: 'grid' },
  })
  @IsDefined()
  @IsObject()
  answers!: Record<string, number[] | string>;
}
