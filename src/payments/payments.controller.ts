import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CheckoutDto, VerifyPaymentDto } from './dto/payments.dto';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('checkout')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Create a Razorpay order for a paid course' })
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.payments.checkout(user, dto.courseId);
  }

  @Post('verify')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Verify Razorpay signature and grant access' })
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyPaymentDto) {
    return this.payments.verifyAndComplete(user, dto);
  }

  @Get('orders')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'My order history' })
  orders(@CurrentUser() user: AuthUser) {
    return this.payments.myOrders(user);
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Razorpay webhook (signature-verified, idempotent)' })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    return this.payments.handleWebhook(raw, signature);
  }
}
