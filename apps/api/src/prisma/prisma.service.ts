/**
 * Prisma istemcisi (ERD.md şeması).
 *
 * Bağlantı dayanıklılığı: başlangıçta $connect() başarısız olursa süreç
 * ÇÖKMEZ — /health/db gerçek durumu dürüstçe raporlar (503 down).
 * Sağlıksız dış servisi başarılı gösteren bir "fake success" yoktur.
 */
import {
  Injectable,
  Logger,
} from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('PostgreSQL bağlantısı kuruldu');
    } catch (error) {
      this.logger.warn(
        `PostgreSQL'e bağlanılamadı (uygulama çalışıyor; /health/db down raporlayacak): ${String(
          error instanceof Error ? error.message : error,
        )}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
