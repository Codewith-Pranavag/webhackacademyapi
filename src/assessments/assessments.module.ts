import { Module } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { QuizController } from './quiz.controller';
import { QuizAuthoringController } from './quiz-authoring.controller';

@Module({
  controllers: [QuizAuthoringController, QuizController],
  providers: [QuizService],
  exports: [QuizService],
})
export class AssessmentsModule {}
