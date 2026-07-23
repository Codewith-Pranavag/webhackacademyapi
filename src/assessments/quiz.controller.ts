import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuizService } from './quiz.service';
import { SubmitQuizDto } from './dto/quiz.dto';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Assessments · Taking')
@ApiBearerAuth('bearerAuth')
@Controller()
export class QuizController {
  constructor(private readonly quiz: QuizService) {}

  @Get('courses/:courseId/quizzes')
  @ApiOperation({ summary: 'List quizzes for a course (enrolled)' })
  list(@Param('courseId') courseId: string, @CurrentUser() user: AuthUser) {
    return this.quiz.listForCourse(courseId, user);
  }

  @Get('quizzes/:id')
  @ApiOperation({ summary: 'Take-view of a quiz (no answers)' })
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quiz.getForTaking(id, user);
  }

  @Post('quizzes/:id/attempts')
  @ApiOperation({ summary: 'Start an attempt' })
  start(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quiz.startAttempt(id, user);
  }

  @Post('quizzes/:id/attempts/:attemptId/submit')
  @ApiOperation({ summary: 'Submit answers → auto-evaluated result' })
  submit(
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.quiz.submitAttempt(id, attemptId, user, dto);
  }

  @Get('quizzes/:id/attempts')
  @ApiOperation({ summary: 'My attempts for a quiz' })
  attempts(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quiz.myAttempts(id, user);
  }
}
