/**
 * Billing modülü (Faz 7): sağlayıcı seçimi env'e göredir.
 *
 * BILLING_PROVIDER=revenuecat → RevenueCatProvider (gizli API anahtarıyla);
 * aksi halde → SimulatedBillingProvider (yalnızca geliştirme/test — üretimde
 * doğrulama uçları 503 döner, sahte başarı üretilmez).
 */
import { Global, Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreditsService } from '../credits/credits.service';
import { BILLING_PROVIDER, type BillingProviderPort } from './provider/billing-provider.port';
import { RevenueCatProvider } from './provider/revenuecat.provider';
import { SimulatedBillingProvider } from './provider/simulated.provider';

@Global()
@Module({
  providers: [
    AuditService,
    IdempotencyService,
    CreditsService,
    SubscriptionsService,
    {
      provide: BILLING_PROVIDER,
      useFactory: (env: Env): BillingProviderPort => {
        return env.BILLING_PROVIDER === 'revenuecat'
          ? new RevenueCatProvider(env)
          : new SimulatedBillingProvider(env);
      },
      inject: [ENV],
    },
    BillingService,
  ],
  controllers: [BillingController],
  exports: [AuditService, IdempotencyService, CreditsService, SubscriptionsService, BillingService, BILLING_PROVIDER],
})
export class BillingModule {}
