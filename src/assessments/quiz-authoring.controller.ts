import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuizService } from './quiz.service';
import {
  CreateQuestionDto,
  CreateQuizDto,
  UpdateQuestionDto,
  UpdateQuizDto,
} from './dto/quiz.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Assessments · Authoring')
@ApiBearerAuth('bearerAuth')
@Roles('instructor', 'admin')
@Controller()
export class QuizAuthoringController {
  constructor(private readonly quiz: QuizService) {}

  @Post('courses/:courseId/quizzes')
  @ApiOperation({ summary: 'Create a quiz on a course' })
  create(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateQuizDto,
  ) {
    return this.quiz.createQuiz(courseId, user, dto);
  }

  @Get('quizzes/:id/manage')
  @ApiOperation({ summary: 'Full quiz incl. correct answers (owner/admin)' })
  manage(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quiz.manageQuiz(id, user);
  }

  @Patch('quizzes/:id')
  @ApiOperation({ summary: 'Update quiz settings' })
  update(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateQuizDto) {
    return this.quiz.updateQuiz(id, user, dto);
  }

  @Delete('quizzes/:id')
  @ApiOperation({ summary: 'Delete a quiz' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quiz.deleteQuiz(id, user);
  }

  @Post('quizzes/:id/questions')
  @ApiOperation({ summary: 'Add a question (MCQ / boolean / fill / code)' })
  addQuestion(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.quiz.addQuestion(id, user, dto);
  }

  @Patch('questions/:id')
  @ApiOperation({ summary: 'Update a question' })
  updateQuestion(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.quiz.updateQuestion(id, user, dto);
  }

  @Delete('questions/:id')
  @ApiOperation({ summary: 'Delete a question' })
  removeQuestion(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quiz.deleteQuestion(id, user);
  }
}
