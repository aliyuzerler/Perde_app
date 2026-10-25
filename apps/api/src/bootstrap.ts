/**
 * Uygulama kurulum yardımcısı — main.ts ve entegrasyon testleri AYNI
 * yapılandırmayı paylaşır (zarf interceptor'ı, hata filtresi, prefix, CORS,
 * Swagger). Böylece testler, üretim davranışının birebir aynısını sınamış
 * olur (çifte kablosaj sapması olmaz).
 */
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import { resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { EnvelopeInterceptor } from './common/envelope.interceptor';
import { AllExceptionsFilter } from './common/error-filter';
import { registerContractSchemas } from './common/openapi-schemas';
import type { Env } from './config/env.schema';

export function configureApp(app: INestApplication, env: Env): void {
  // Webhook imza doğrulaması için HAM gövde korunur.
  app.use(
    json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  // Sürümükleme: sürümlü uçlar /api/v1 altında; altyapı uçları ve görseller kökte.
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/db', 'placeholders/(.*)' as never],
  });

  const origins = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.enableCors({ origin: origins });
  }

  // Zarf + hata filtresi (tüm istisnalar ApiEnvelope'a çevrilir).
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new EnvelopeInterceptor(reflector));
  app.useGlobalFilters(new AllExceptionsFilter());

  // Profil fotoğrafları: /uploads/avatars/<dosya> statik yayın (Faz 3b).
  // setGlobalPrefix Nest rotalarını etkiler; express middleware'i kökte kalır.
  // Not: platform-express uygulaması üzerinde çalışır (cast güvenli — tek
  // adapter express'tir; testler de aynı kurulumu kullanır).
  (app as NestExpressApplication).useStaticAssets(
    resolve(process.cwd(), env.UPLOAD_DIR),
    {
      prefix: '/uploads',
      maxAge: '30d',
      immutable: true,
    },
  );

  // Swagger / OpenAPI — sözleşme şemaları bileşen olarak kaydedilir.
  const config = new DocumentBuilder()
    .setTitle('PerdeGo API')
    .setDescription(
      'Dikey kısa film ve mini dizi izleme platformu REST API (v1). ' +
        'Tüm yanıtlar ApiEnvelope zarfı kullanır: { ok: true, data } | { ok: false, error: { code, message, details } }. ' +
        'Kimlik: Authorization: Bearer <accessToken> (RS256, 15 dk). Para/kredi POST uçlarında Idempotency-Key zorunludur (BR-06).',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'accessToken')
    .addApiKey({ type: 'apiKey', name: 'Idempotency-Key', in: 'header' }, 'idempotencyKey')
    .build();
  const document = SwaggerModule.createDocument(app as never, config, { deepScanRoutes: true });
  registerContractSchemas(document);
  SwaggerModule.setup('api/docs', app as never, document, {
    customSiteTitle: 'PerdeGo API — Swagger',
    swaggerOptions: { persistAuthorization: true },
  });
}
