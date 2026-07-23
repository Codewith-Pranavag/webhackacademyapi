import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurriculumService } from './curriculum.service';
import { CreateSectionDto, ReorderDto, UpdateSectionDto } from './dto/curriculum.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Curriculum · Sections')
@ApiBearerAuth('bearerAuth')
@Roles('instructor', 'admin')
@Controller()
export class SectionsController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Get('courses/:courseId/sections')
  @ApiOperation({ summary: 'List a course curriculum (owner/admin)' })
  list(@Param('courseId') courseId: string, @CurrentUser() user: AuthUser) {
    return this.curriculum.listSectionsForOwner(courseId, user);
  }

  @Post('courses/:courseId/sections')
  @ApiOperation({ summary: 'Create a section' })
  create(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSectionDto,
  ) {
    return this.curriculum.createSection(courseId, user, dto);
  }

  @Patch('courses/:courseId/sections/reorder')
  @ApiOperation({ summary: 'Reorder sections' })
  reorder(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReorderDto,
  ) {
    return this.curriculum.reorderSections(courseId, user, dto.ids);
  }

  @Patch('sections/:id')
  @ApiOperation({ summary: 'Update a section' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.curriculum.updateSection(id, user, dto);
  }

  @Delete('sections/:id')
  @ApiOperation({ summary: 'Delete a section (and its lessons)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.curriculum.deleteSection(id, user);
  }
}
