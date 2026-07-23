import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminUsersService } from './admin-users.service';
import {
  InviteUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './dto/admin-users.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Admin · Users')
@ApiBearerAuth('bearerAuth')
@Roles('admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (filter by role, status, query)' })
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user' })
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invite a new user with a role' })
  invite(@Body() dto: InviteUserDto) {
    return this.users.invite(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user role / status' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.update(id, dto, actor.sub);
  }
}
