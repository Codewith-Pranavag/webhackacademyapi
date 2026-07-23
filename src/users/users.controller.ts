import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
import { UsersService } from './users.service';
import { UpdatePreferencesDto, UpdateProfileDto } from './dto/user.dto';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { uuid } from '../common/crypto.util';

const AVATAR_DIR = './uploads/avatars';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

@ApiTags('Users')
@ApiBearerAuth('bearerAuth')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my profile' })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.sub, dto);
  }

  @Get('me/preferences')
  @ApiOperation({ summary: 'Get my notification/privacy preferences' })
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.users.getPreferences(user.sub);
  }

  @Put('me/preferences')
  @ApiOperation({ summary: 'Update my preferences (settings)' })
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.users.updatePreferences(user.sub, dto);
  }

  @Post('me/avatar')
  @ApiOperation({ summary: 'Upload / replace my avatar (image, max 5 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: AVATAR_DIR,
        filename: (_req, file, cb) =>
          cb(null, `${uuid()}${extname(file.originalname).toLowerCase()}`),
      }),
      limits: { fileSize: MAX_AVATAR_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) {
          cb(new BadRequestException('Only PNG, JPG, WEBP or GIF images are allowed.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return this.users.setAvatar(user.sub, file);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Public profile' })
  publicProfile(@Param('id') id: string) {
    return this.users.publicProfile(id);
  }
}
