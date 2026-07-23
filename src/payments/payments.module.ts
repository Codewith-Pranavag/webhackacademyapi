import { Module } from '@nestjs/common';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { PaymentsService } from './payments.service';
import { RazorpayService } from './razorpay.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [EnrollmentModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, RazorpayService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
