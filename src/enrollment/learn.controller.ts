import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EnrollmentService } from './enrollment.service';
import { LessonProgressDto } from './dto/enrollment.dto';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Learning')
@ApiBearerAuth('bearerAuth')
@Controller('learn')
export class LearnController {
  constructor(private readonly enrollment: EnrollmentService) {}

  @Get(':courseId')
  @ApiOperation({ summary: 'Course player payload (enrolled / owner / admin)' })
  player(@Param('courseId') courseId: string, @CurrentUser() user: AuthUser) {
    return this.enrollment.getLearn(user, courseId);
  }

  @Get(':courseId/progress')
  @ApiOperation({ summary: 'My progress in a course' })
  progress(@Param('courseId') courseId: string, @CurrentUser() user: AuthUser) {
    return this.enrollment.getProgress(user, courseId);
  }

  @Post(':courseId/lessons/:lessonId/progress')
  @ApiOperation({ summary: 'Report lesson progress (heartbeat / completion)' })
  reportProgress(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: LessonProgressDto,
  ) {
    return this.enrollment.reportProgress(user, courseId, lessonId, dto);
  }
}
