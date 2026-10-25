/**
 * PerdeGo API giriş noktası.
 *
 * Başlama sırası:
 *  1. Ortam değişkenleri Zod ile doğrulanır; hata varsa anlaşılır listeyle
 *     süreç 1 koduyla çıkar (sessiz yanlış yapılandırma yok).
 *  2. Nest uygulaması ayağa kalkar; /health ve /health/db prefix'siz,
 *     sürümlü uçlar /api/v1/* altındadır.
 */
import 'reflect-metadata';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadDotenvFile } from './config/load-dotenv';
import { loadEnv } from './config/env.schema';

async function bootstrap(): Promise<void> {
  // 0) Yerel .env yükle (varsa; gerçek ortam değişkenleri önceliklidir)
  loadDotenvFile(resolve(process.cwd(), '.env'));

  // 1) Ortam doğrulaması (kabul kriteri: eksik env → anlaşılır hata)
  const result = loadEnv(process.env);
  if (!result.ok) {
    console.error(
      [
        '',
        '[PerdeGo API] Ortam değişkenleri doğrulanamadı:',
        ...result.errors!.map((e) => `  ${e}`),
        '',
        '  Çözüm: apps/api dizininde `cp .env.example .env` yapıp değerleri',
        '  doldurun; PostgreSQL için kök dizinden `pnpm db:up` çalıştırın.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
  const env = result.env!;

  // 2) Uygulama
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Sürümükleme: sürümlü uçlar /api/v1 altında; altyapı sağlık uçları kökte.
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/db'],
  });

  const origins = env.CORS_ORIGINS
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.enableCors({ origin: origins });
  }

  // Port çakışması (EADDRINUSE) vb.: http sunucusunun 'error' olayı promise'e
  // yansımadan süreci ham stack ile çökertir; dinleyiciyle dostu mesaj ver.
  const reportListenError = (err: unknown): void => {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: unknown }).code)
        : 'LISTEN_HATASI';
    if (code === 'EADDRINUSE') {
      console.error(
        `[PerdeGo API] Port ${env.PORT} kullanımda (EADDRINUSE).`,
        '\n  Çözüm: apps/api/.env içinde PORT değerini değiştirin veya portu kullanan süreci kapatın.',
      );
    } else {
      console.error(
        `[PerdeGo API] ${env.PORT} portunda dinlemeye geçilemedi (${code}):`,
        err instanceof Error ? err.message : err,
      );
    }
    process.exit(1);
  };
  app.getHttpServer().once('error', reportListenError);

  try {
    await app.listen(env.PORT, '0.0.0.0');
  } catch (error) {
    await app.close().catch(() => undefined);
    reportListenError(error);
  }
  console.log(
    `[PerdeGo API] hazır: http://localhost:${env.PORT} (health: /health, db: /health/db, mod: ${env.NODE_ENV})`,
  );
}

void bootstrap();
