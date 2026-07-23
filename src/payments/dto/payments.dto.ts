import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CheckoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  courseId!: string;
}

export class VerifyPaymentDto {
  @ApiProperty({ description: 'razorpay_order_id from checkout' })
  @IsString()
  @IsNotEmpty()
  razorpayOrderId!: string;

  @ApiProperty({ description: 'razorpay_payment_id from the checkout success handler' })
  @IsString()
  @IsNotEmpty()
  razorpayPaymentId!: string;

  @ApiProperty({ description: 'razorpay_signature from the checkout success handler' })
  @IsString()
  @IsNotEmpty()
  razorpaySignature!: string;
}
