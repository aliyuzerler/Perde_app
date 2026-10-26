/**
 * FAZ 10 güvenlik sertleştirme birim testleri — bootstrap kablosajı.
 *
 * Kanıtlananlar (canlı probe koşmadan, hızlı geribildirim):
 *  - F10-01: temel güvenlik başlıkları her yanıtta; HSTS yalnız üretimde.
 *  - F10-03: Swagger /api/docs geliştirme/test'te açık, ÜRETİMDE KAPALI;
 *            SWAGGER_ENABLED=true ile üretimde bilinçli açılabilir.
 *
 * Tam AppModule boot ETMEZ (DB gerektirmez): tek denetleyicili minimal modül
 * + configureApp (gerçek üretim kablosajı) + geçici port üzerinde fetch.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { configureApp } from './bootstrap';
import { loadEnv } from './config/env.schema';

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');

function makeKeyPair(): { privatePemB64: string; publicPemB64: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privatePemB64: b64(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()),
    publicPemB64: b64(publicKey.export({ type: 'spki', format: 'pem' }).toString()),
  };
}

const keys = makeKeyPair();

@Controller()
class ProbeController {
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

async function boot(sourceEnv: NodeJS.ProcessEnv): Promise<{ app: INestApplication; url: string }> {
  const loaded = loadEnv(sourceEnv);
  if (!loaded.ok) throw new Error(`env yüklenemedi: ${loaded.errors?.join('; ')}`);
  const app = await NestFactory.create(ProbeModule, { logger: false });
  configureApp(app, loaded.env!);
  await app.listen(0);
  const url = await app.getUrl();
  return { app, url };
}

describe('FAZ 10 bootstrap güvenlik sertleştirmesi', () => {
  let testApp: INestApplication;
  let testUrl: string;
  let prodApp: INestApplication;
  let prodUrl: string;
  let prodSwaggerApp: INestApplication;
  let prodSwaggerUrl: string;

  beforeAll(async () => {
    const testEnv = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      WEBHOOK_SIGNING_SECRET: 'bootstrap-spec-imza-sirri-0123456789',
    };
    const prodEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      WEBHOOK_SIGNING_SECRET: 'bootstrap-spec-imza-sirri-0123456789',
      JWT_ACCESS_PRIVATE_KEY: keys.privatePemB64,
      JWT_ACCESS_PUBLIC_KEY: keys.publicPemB64,
      MEDIA_PROVIDER: 'bunny',
    };
    const a = await boot(testEnv);
    testApp = a.app;
    testUrl = a.url;
    const b = await boot(prodEnv);
    prodApp = b.app;
    prodUrl = b.url;
    const c = await boot({ ...prodEnv, SWAGGER_ENABLED: 'true' });
    prodSwaggerApp = c.app;
    prodSwaggerUrl = c.url;
  }, 60_000);

  afterAll(async () => {
    await Promise.allSettled([
      testApp?.close(),
      prodApp?.close(),
      prodSwaggerApp?.close(),
    ]);
  });

  it('F10-01: temel güvenlik başlıkları her yanıtta mevcut', async () => {
    const res = await fetch(`${testUrl}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('F10-01b: HSTS geliştirme/testte YOK', async () => {
    const res = await fetch(`${testUrl}/health`);
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });

  it('F10-01c: HSTS üretimde mevcut', async () => {
    const res = await fetch(`${prodUrl}/health`);
    expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000');
  });

  it('F10-03: Swagger geliştirme/testte açık', async () => {
    const res = await fetch(`${testUrl}/api/docs`);
    expect(res.status).toBe(200);
  });

  it('F10-03b: Swagger ÜRETİMDE KAPALI (varsayılan)', async () => {
    const res = await fetch(`${prodUrl}/api/docs`);
    expect(res.status).toBe(404);
  });

  it('F10-03c: Üretimde SWAGGER_ENABLED=true ile bilinçli açılır', async () => {
    const res = await fetch(`${prodSwaggerUrl}/api/docs`);
    expect(res.status).toBe(200);
  });
});
