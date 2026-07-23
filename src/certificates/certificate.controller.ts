import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CertificateService } from './certificate.service';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Certificates')
@Controller('certificates')
export class CertificateController {
  constructor(private readonly certificates: CertificateService) {}

  @Get()
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'My certificates (auto-issued for completed courses)' })
  mine(@CurrentUser() user: AuthUser) {
    return this.certificates.myCertificates(user);
  }

  @Post('course/:courseId')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Claim the certificate for a completed course' })
  issue(@Param('courseId') courseId: string, @CurrentUser() user: AuthUser) {
    return this.certificates.issueForCourse(user, courseId);
  }

  @Public()
  @Get('verify/:credentialId')
  @ApiOperation({ summary: 'Publicly verify a credential' })
  verify(@Param('credentialId') credentialId: string) {
    return this.certificates.verify(credentialId);
  }

  @Get(':id')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Get one of my certificates' })
  getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.certificates.getOne(user, id);
  }
}
