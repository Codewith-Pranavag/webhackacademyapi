import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
import { CurriculumService } from './curriculum.service';
import {
  AddResourceLinkDto,
  CreateLessonDto,
  ReorderDto,
  UpdateLessonDto,
} from './dto/curriculum.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { uuid } from '../common/crypto.util';

const RESOURCE_DIR = './uploads/resources';
const MAX_RESOURCE_BYTES = 25 * 1024 * 1024;
const ALLOWED_RESOURCE_MIME =
  /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.[\w.-]+|application\/vnd\.ms-\w+|application\/zip|application\/x-zip-compressed|text\/plain|image\/(png|jpe?g|webp|gif))$/;

@ApiTags('Curriculum · Lessons')
@ApiBearerAuth('bearerAuth')
@Roles('instructor', 'admin')
@Controller()
export class LessonsController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Post('sections/:sectionId/lessons')
  @ApiOperation({ summary: 'Create a lesson' })
  create(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLessonDto,
  ) {
    return this.curriculum.createLesson(sectionId, user, dto);
  }

  @Patch('sections/:sectionId/lessons/reorder')
  @ApiOperation({ summary: 'Reorder lessons within a section' })
  reorder(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReorderDto,
  ) {
    return this.curriculum.reorderLessons(sectionId, user, dto.ids);
  }

  @Get('lessons/:id')
  @ApiOperation({ summary: 'Get a lesson (owner/admin) — includes video URL + resources' })
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.curriculum.getLesson(id, user);
  }

  @Patch('lessons/:id')
  @ApiOperation({ summary: 'Update a lesson (title, video URL, preview, duration, content)' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.curriculum.updateLesson(id, user, dto);
  }

  @Delete('lessons/:id')
  @ApiOperation({ summary: 'Delete a lesson' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.curriculum.deleteLesson(id, user);
  }

  @Post('lessons/:id/resources')
  @ApiOperation({ summary: 'Attach a file (PDF / doc / zip / image, max 25 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        label: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: RESOURCE_DIR,
        filename: (_req, file, cb) =>
          cb(null, `${uuid()}${extname(file.originalname).toLowerCase()}`),
      }),
      limits: { fileSize: MAX_RESOURCE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_RESOURCE_MIME.test(file.mimetype)) {
          cb(new BadRequestException('Unsupported file type.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadResource(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
    @Body('label') label?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return this.curriculum.addResourceFile(id, user, file, label);
  }

  @Post('lessons/:id/resources/link')
  @ApiOperation({ summary: 'Attach an external resource link' })
  addLink(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AddResourceLinkDto,
  ) {
    return this.curriculum.addResourceLink(id, user, dto);
  }

  @Delete('lessons/:id/resources/:resourceId')
  @ApiOperation({ summary: 'Remove a lesson resource' })
  removeResource(
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.curriculum.removeResource(id, resourceId, user);
  }
}
