import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CreditsService } from './credits.service';
import { CreditsController } from './credits.controller';

@Module({
  imports: [BillingModule],
  providers: [CreditsService],
  controllers: [CreditsController],
  exports: [CreditsService],
})
export class CreditsModule {}
