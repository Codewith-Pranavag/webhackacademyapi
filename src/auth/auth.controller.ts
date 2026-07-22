import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser, type AuthUser } from './decorators/current-user.decorator';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import type { Env } from '../config/env.validation';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/v1/auth';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly isProd: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    config: ConfigService<Env, true>,
  ) {
    this.isProd = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new account (Argon2 + JWT + email verification)' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(dto, this.meta(req));
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return result;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in with email + password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, this.meta(req));
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate tokens using a refresh token (body or cookie)' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = dto.refreshToken ?? this.readRefreshCookie(req);
    const result = await this.auth.refresh(raw, this.meta(req));
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return result;
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Log out — revokes the refresh token family' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = dto.refreshToken ?? this.readRefreshCookie(req);
    await this.auth.logout(raw, user.sub);
    this.clearRefreshCookie(res);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify an email address with a token' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(202)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Resend the email verification token' })
  resendVerification(@CurrentUser() user: AuthUser) {
    return this.auth.resendVerification(user.sub);
  }

  @Post('change-password')
  @HttpCode(204)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Change password (revokes all sessions)' })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.sub, dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  @ApiOperation({ summary: 'Request a password reset (mail pipeline pending)' })
  forgotPassword(@Body() _dto: ForgotPasswordDto) {
    // Always 202 — never reveal whether the account exists.
    return { status: 'accepted' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Reset password with a token (mail pipeline pending)' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Get('me')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Current authenticated user' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub);
  }

  // ------------------------------------------------------------------ helpers
  private meta(req: Request) {
    return {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    };
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.tokens.refreshCookieMaxAgeMs(),
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    return cookies?.[REFRESH_COOKIE];
  }
}
