import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type Level = (typeof LEVELS)[number];

export class CreateCourseDto {
  @ApiProperty({ minLength: 5, maxLength: 120 })
  @IsString()
  @MinLength(5)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  subtitle?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({ enum: LEVELS, default: 'beginner' })
  @IsOptional()
  @IsIn(LEVELS)
  level?: Level;

  @ApiPropertyOptional({ minimum: 0, description: 'Price in minor units (cents); 0 = free' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priceCents?: number;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3, default: 'USD' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 12 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  outcomes?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 12 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  requirements?: string[];
}

export class UpdateCourseDto {
  @ApiPropertyOptional({ minLength: 5, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  subtitle?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: LEVELS })
  @IsOptional()
  @IsIn(LEVELS)
  level?: Level;

  @ApiPropertyOptional({ type: [String], maxItems: 12 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  outcomes?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 12 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  requirements?: string[];
}

export class SetPricingDto {
  @ApiProperty({ minimum: 0, description: 'Price in cents; 0 = free' })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priceCents!: number;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3, default: 'USD' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class ListCoursesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Category slug or id' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: LEVELS })
  @IsOptional()
  @IsIn(LEVELS)
  level?: Level;

  @ApiPropertyOptional({ enum: ['free', 'paid'] })
  @IsOptional()
  @IsIn(['free', 'paid'])
  price?: 'free' | 'paid';

  @ApiPropertyOptional({
    enum: ['newest', 'rating', 'popular', 'price_asc', 'price_desc'],
    default: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'rating', 'popular', 'price_asc', 'price_desc'])
  sort?: 'newest' | 'rating' | 'popular' | 'price_asc' | 'price_desc';
}
