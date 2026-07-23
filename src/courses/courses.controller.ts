import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import {
  CreateCourseDto,
  ListCoursesQueryDto,
  SetPricingDto,
  UpdateCourseDto,
} from './dto/course.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  // --- Public reads
  @Public()
  @Get()
  @ApiOperation({ summary: 'Browse published courses (filters + pagination)' })
  list(@Query() query: ListCoursesQueryDto) {
    return this.courses.list(query);
  }

  // --- Instructor reads (declared before :slug to avoid route clash)
  @Get('mine')
  @Roles('instructor', 'admin')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: "List my courses (all statuses)" })
  mine(@CurrentUser() user: AuthUser) {
    return this.courses.mine(user);
  }

  @Get('manage/:id')
  @Roles('instructor', 'admin')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Get a course I own/admin (any status) for editing' })
  manage(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.manage(id, user);
  }

  // --- Create / mutate
  @Post()
  @Roles('instructor', 'admin')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Create a course (draft)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCourseDto) {
    return this.courses.create(user, dto);
  }

  @Patch(':id')
  @Roles('instructor', 'admin')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Update a course' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.courses.update(id, user, dto);
  }

  @Patch(':id/pricing')
  @Roles('instructor', 'admin')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Set course pricing' })
  setPricing(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetPricingDto,
  ) {
    return this.courses.setPricing(id, user, dto);
  }

  @Post(':id/submit')
  @Roles('instructor', 'admin')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Submit a course for review' })
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.submit(id, user);
  }

  @Post(':id/publish')
  @Roles('instructor', 'admin')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Publish a course' })
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.publish(id, user);
  }

  @Post(':id/unpublish')
  @Roles('instructor', 'admin')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Unpublish a course (back to draft)' })
  unpublish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.unpublish(id, user);
  }

  @Delete(':id')
  @Roles('instructor', 'admin')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Delete a course (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.remove(id, user);
  }

  // --- Public landing page (keep last: :slug is a catch-all GET)
  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Course landing page (published)' })
  landing(@Param('slug') slug: string) {
    return this.courses.landing(slug);
  }
}
