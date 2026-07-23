import { Module } from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { SectionsController } from './sections.controller';
import { LessonsController } from './lessons.controller';

@Module({
  controllers: [SectionsController, LessonsController],
  providers: [CurriculumService],
  exports: [CurriculumService],
})
export class CurriculumModule {}
