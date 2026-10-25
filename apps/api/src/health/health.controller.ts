import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';
import { Public } from '../auth/guards';

/** /health yanıtındaki sürüm alanı — npm_package_version yalnızca paket
 * yöneticisi script'iyle başlatınca tanımlıdır; doğrudan `node dist/main.js`
 * ile de doğru sürüm raporlansın diye package.json'dan okunur.
 * Not: webpack bundle'da __filename dist köküne işaret eder; aday yollar
 * sırayla denenir, bulunamazsa 0.0.0'a düşer (boot'u engellemez). */
function readVersion(): string {
  const candidates = [
    resolve(process.cwd(), 'package.json'),
    resolve(process.cwd(), '../api/package.json'),
    resolve(__dirname, '../package.json'),
    resolve(__dirname, '../../package.json'),
  ];
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) {
        return createRequire(candidate)(candidate).version ?? '0.0.0';
      }
    } catch {
      // sıradaki aday denenir
    }
  }
  return process.env.npm_package_version ?? '0.0.0';
}

export const API_VERSION: string = readVersion();

@Public()
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
