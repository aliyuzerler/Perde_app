import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Süreç canlılığı — dış servis beklemez (LB/k8s liveness). */
  @Get('health')
  live() {
    return {
      ok: true,
      service: 'perdego-api',
      version: API_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Hazırlık — PostgreSQL gerçek bağlantı testi.
   * DB erişilemezse 503 + hata detayı (dürüst başarısızlık; fake success yok).
   */
  @Get('health/db')
  async ready(@Res() res: Response) {
    const database = await this.health.databaseCheck();
    const ok = database.status === 'up';
    res.status(ok ? 200 : 503).json({
      ok,
      checks: { database },
      timestamp: new Date().toISOString(),
    });
  }
}
