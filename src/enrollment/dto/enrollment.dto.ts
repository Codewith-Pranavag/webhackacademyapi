import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class EnrollDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  courseId!: string;
}

export class PurchaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  courseId!: string;
}

export class LessonProgressDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 86400, description: 'Total seconds watched' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400)
  watchedSeconds?: number;

  @ApiPropertyOptional({ description: 'Mark the lesson complete/incomplete' })
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
