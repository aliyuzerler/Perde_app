import { Global, Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreditsService } from '../credits/credits.service';

@Global()
@Module({
  providers: [AuditService, IdempotencyService, CreditsService, SubscriptionsService, BillingService],
  controllers: [BillingController],
  exports: [AuditService, IdempotencyService, CreditsService, SubscriptionsService, BillingService],
})
export class BillingModule {}
