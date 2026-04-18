import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingRepository } from './billing.repository';
import { RazorpayService } from './razorpay.service';

@Module({
  imports: [],
  controllers: [BillingController],
  providers: [BillingService, BillingRepository, RazorpayService],
  exports: [BillingService, RazorpayService],
})
export class BillingModule {}
