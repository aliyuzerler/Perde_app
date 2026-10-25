/**
 * Sağlık kontrolleri.
 *
 * İlkeler (görev madde 10):
 *  - /health    → süreç canlılığı (her zaman hızlı 200; dış servis BEKLEMEZ)
 *  - /health/db → PostgreSQL gerçek bağlantı testi (SELECT 1).
 *    Down ise 503 + hata detayı döner; ASLA başarılı taklidi yapılmaz.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CheckResult {
  name: string;
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async databaseCheck(): Promise<CheckResult> {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        name: 'database',
        status: 'up',
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        name: 'database',
        status: 'down',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
