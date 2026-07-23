import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EnrollmentService } from './enrollment.service';
import { EnrollDto } from './dto/enrollment.dto';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Enrollment')
@ApiBearerAuth('bearerAuth')
@Controller('enrollments')
export class EnrollmentController {
  constructor(private readonly enrollment: EnrollmentService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Enroll in a free course' })
  enroll(@CurrentUser() user: AuthUser, @Body() dto: EnrollDto) {
    return this.enrollment.enroll(user, dto.courseId);
  }

  @Get()
  @ApiOperation({ summary: 'My Learning — all my enrollments with progress' })
  myEnrollments(@CurrentUser() user: AuthUser) {
    return this.enrollment.myEnrollments(user);
  }

  @Get('continue')
  @ApiOperation({ summary: 'Continue Learning — in-progress courses' })
  continueLearning(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    const n = Math.min(Math.max(Number(limit) || 4, 1), 12);
    return this.enrollment.continueLearning(user, n);
  }
}
