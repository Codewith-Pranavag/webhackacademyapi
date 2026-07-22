import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
const PASSWORD_MSG =
  'Password must be 8–128 chars and include at least one letter and one number.';

export class RegisterDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MSG })
  password!: string;
}

export class LoginDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}

export class RefreshDto {
  @ApiPropertyOptional({ description: 'Omitted when sent via httpOnly cookie' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MSG })
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  current!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MSG })
  next!: string;
}

export class VerifyEmailDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token!: string;
}
