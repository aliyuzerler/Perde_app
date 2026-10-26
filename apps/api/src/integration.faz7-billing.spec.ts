/**
 * Faz 7 ENTEGRASYON testleri — gerçek PostgreSQL üzerinde ödeme altyapısı.
 *
 * Kapsam: temiz test veritabanı → migrate deploy → seed → gerçek HTTP
 * dinleyicisi üzerinden:
 *   - /billing/config (sağlayıcı durumu + mağaza ürün kimlikleri)
 *   - /billing/purchases/validate (simülasyon sağlayıcı, Idempotency-Key,
 *     UNIQUE işlem tekilleştirme)
 *   - kredi cüzdanı + bölüm açma (kredi harcama akışı, regresyon)
 *   - genel webhook zarfı (HMAC imzalı): abonelik aktivasyonu + iade
 *   - iade düzeltmesi (Güvenlik-7): kredi REFUND ledger + abonelik EXPIRED
 *   - RC webhook ucu yapılandırılmamışken 503 (fail-closed)
 *
 * Çalışma şartı: yerel PostgreSQL erişilebilir olmalı; değilse dürüstçe SKIP.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { execSync, spawnSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { RateLimiterService } from './auth/rate-limit.service.js';

const ADMIN_DB_URL = 'postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/postgres';
const TEST_DB = 'perdego_faz7_test';
const TEST_DB_URL = `postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/${TEST_DB}`;
const WEBHOOK_SECRET = 'faz7-entegrasyon-imza-sirri-0123456789';

interface Envelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

let app: INestApplication;
let baseUrl = '';

// DB erişilebilirlik kontrolü (engelli test sahte başarı üretmez, SKIP eder).
let dbAvailable = false;
try {
  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      `const {Client}=require('pg');` +
        `const c=new Client({connectionString:${JSON.stringify(ADMIN_DB_URL)},connectionTimeoutMillis:3000});` +
        `c.connect().then(()=>c.end()).then(()=>process.exit(0)).catch(()=>process.exit(1));`,
    ],
    { stdio: 'ignore', timeout: 10_000, cwd: process.cwd() },
  );
  dbAvailable = probe.status === 0;
} catch {
  dbAvailable = false;
}
if (!dbAvailable) {
  console.warn('[integration-faz7] PostgreSQL erişilemedi — entegrasyon testleri SKIP edilecek.');
}

async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Envelope<T> }> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = (await res.json()) as Envelope<T>;
  return { status: res.status, body };
}

function signBody(raw: string): string {
  return `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex')}`;
}

async function registerVerified(
  displayName: string,
  email: string,
  password = 'Qa123456',
): Promise<{ accessToken: string; userId: string }> {
  const reg = await api<{ tokens: { accessToken: string }; user: { id: string } }>('POST', '/auth/register', {
    body: { displayName, email, password },
  });
  expect(reg.status).toBe(201);
  const token = reg.body.data!.tokens.accessToken;
  const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64').toString('utf8')) as {
    sub?: string;
  };
  return { accessToken: token, userId: payload.sub ?? '' };
}

beforeAll(async () => {
  if (!dbAvailable) return;

  // 1) Temiz test veritabanı
  const admin = new Client({ connectionString: ADMIN_DB_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  // 2) Migration + seed (sıfırdan)
  execSync(`pnpm exec prisma migrate deploy`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  });
  execSync(`pnpm exec tsx prisma/seed.ts`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  });

  // 3) Uygulama: NODE_ENV=test (simülasyon sağlayıcı yalnız geliştirmede
  // doğrulama yapabilir), webhook imza sırrı set → HMAC zorunlu.
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.WEBHOOK_SIGNING_SECRET = WEBHOOK_SECRET;
  const { AppModule } = await import('./app.module.js');
  const { configureApp } = await import('./bootstrap.js');
  const { loadEnv } = await import('./config/env.schema.js');
  const envResult = loadEnv(process.env);
  expect(envResult.ok).toBe(true);

  app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app, envResult.env!);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
}, 180_000);

afterAll(async () => {
  if (app) await app.close();
});

describe.skipIf(!dbAvailable)('Faz 7 — ödeme altyapısı entegrasyonu (gerçek PostgreSQL)', () => {
  beforeEach(async () => {
    // Hız sınırlayıcı izolasyonu — her test kendi penceresiyle başlar.
    app?.get(RateLimiterService)?.reset?.();
  });

  it('01 · /billing/config: yapılandırma durumu + mağaza ürün kimlikleri (ortam ayrımı DB)', async () => {
    const { status, body } = await api<{
      provider: string;
      configured: boolean;
      subscriptionProducts: Array<{ planId: string; productIds: { ios: string } }>;
      creditPackProducts: Array<{ packId: string; productIds: { android: string } }>;
    }>('GET', '/billing/config');
    expect(status).toBe(200);
    expect(body.data!.provider).toBe('none');
    // Simülasyon sağlayıcı gerçek ödeme DEĞİLDİR → istemciye configured=false.
    expect(body.data!.configured).toBe(false);
    expect(body.data!.subscriptionProducts.length).toBeGreaterThanOrEqual(2);
    expect(body.data!.creditPackProducts.length).toBe(3);
    const monthly = body.data!.subscriptionProducts.find((p) => p.planId === 'SUB_MONTHLY');
    expect(monthly?.productIds.ios).toBe('perdego.sub.monthly');
    const pack = body.data!.creditPackProducts.find((p) => p.packId === 'PACK_10');
    expect(pack?.productIds.android).toBe('perdego.pack.pack_10');
  });

  it('02 · RC webhook ucu sağlayıcı yapılandırılmamışken 503 döner (fail-closed)', async () => {
    const raw = JSON.stringify({ event: { type: 'TEST', id: 'rc-no-config', original_app_user_id: 'x' } });
    const res = await fetch(`${baseUrl}/api/v1/billing/webhooks/revenuecat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer herhangi' },
      body: raw,
    });
    const body = (await res.json()) as Envelope;
    expect(res.status).toBe(503);
    expect(body.error?.details).toMatchObject({ reason: 'BILLING_NOT_CONFIGURED' });
  });

  it('03 · validate: kredi paketi satın alması cüzdana yazılır + Idempotency-Key tekrarı', async () => {
    const { accessToken } = await registerVerified('Faz7 Viewer', 'faz7-1@perdego.test');
    const headers = { 'Idempotency-Key': 'faz7-idem-pack10-001' };
    const purchaseBody = {
      platform: 'IOS',
      productType: 'CREDIT_PACK',
      productId: 'perdego.pack.pack_10',
      storeTransactionId: 'faz7_tx_001',
      appUserId: undefined,
    };

    const first = await api<{
      storeTransactionId: string;
      alreadyProcessed: boolean;
      wallet: { purchased: number; granted: number };
    }>('POST', '/billing/purchases/validate', {
      token: accessToken,
      headers,
      body: purchaseBody,
    });
    expect(first.status).toBe(201);
    expect(first.body.data!.alreadyProcessed).toBe(false);
    expect(first.body.data!.wallet?.purchased).toBe(10);

    // Aynı Idempotency-Key ile tekrar: İLK yanıtın birebir aynısı döner
    // (BR-06 sözleşmesi — cached response; çift işleme yok).
    const replay = await api<{ alreadyProcessed: boolean; wallet: { purchased: number } }>(
      'POST',
      '/billing/purchases/validate',
      { token: accessToken, headers, body: purchaseBody },
    );
    expect(replay.body.data).toEqual(first.body.data);

    // Farklı key, aynı mağaza işlem kimliği: UNIQUE(platform, tx) yakalar.
    const dupTx = await api<{ alreadyProcessed: boolean; wallet: { purchased: number } }>(
      'POST',
      '/billing/purchases/validate',
      {
        token: accessToken,
        headers: { 'Idempotency-Key': 'faz7-idem-pack10-002' },
        body: purchaseBody,
      },
    );
    expect(dupTx.body.data!.alreadyProcessed).toBe(true);
    expect(dupTx.body.data!.wallet?.purchased).toBe(10);

    // Idempotency-Key olmadan 400 (BR-06).
    const noKey = await api('POST', '/billing/purchases/validate', {
      token: accessToken,
      body: purchaseBody,
    });
    expect(noKey.status).toBe(400);

    // Ledger: PURCHASE satırı append-only.
    const db = new Client({ connectionString: TEST_DB_URL });
    await db.connect();
    const ledger = await db.query(
      `SELECT type, "purchasedDelta" AS purchased_delta, "idempotencyKey" AS idempotency_key, "expiresAt" AS expires_at
       FROM credit_ledger
       WHERE "idempotencyKey" = $1`,
      ['purchase:IOS:faz7_tx_001'],
    );
    await db.end();
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]!.type).toBe('PURCHASE');
    expect(ledger.rows[0]!.purchased_delta).toBe(10);
    // Güvenlik-8: satın alınan kredi expires_at=null (süresiz bakiye).
    expect(ledger.rows[0]!.expires_at).toBeNull();
  });

  it('04 · krediyle bölüm açma çalışır (regresyon) ve ikinci açma kredi düşmez', async () => {
    const { accessToken } = await registerVerified('Faz7 Viewer2', 'faz7-2@perdego.test');
    // 10 kredi yükle.
    await api('POST', '/billing/purchases/validate', {
      token: accessToken,
      headers: { 'Idempotency-Key': 'faz7-idem-pack-unlock' },
      body: {
        platform: 'IOS',
        productType: 'CREDIT_PACK',
        productId: 'perdego.pack.pack_10',
        storeTransactionId: 'faz7_tx_unlock',
      },
    });

    // Seed'den CREDIT bölümlerinden biri (DB doğrudan erişim — test verisi).
    const db = new Client({ connectionString: TEST_DB_URL });
    await db.connect();
    const creditEpisode = await db.query(
      `SELECT e.id, e."creditCost" AS credit_cost FROM episodes e
       JOIN contents c ON c.id = e."contentId"
       WHERE e."accessType" = 'CREDIT' AND e."creditCost" IS NOT NULL
         AND c.status = 'PUBLISHED' AND e.status = 'PUBLISHED'
       ORDER BY e."creditCost" ASC LIMIT 1`,
    );
    await db.end();
    expect(creditEpisode.rows.length).toBeGreaterThanOrEqual(1);
    const episodeId = creditEpisode.rows[0]!.id as string;
    const cost = creditEpisode.rows[0]!.credit_cost as number;

    const unlock1 = await api<{
      unlocked: boolean;
      alreadyUnlocked: boolean;
      balance: { total: number };
    }>('POST', `/credits/unlock/${episodeId}`, { token: accessToken, body: {} });
    expect(unlock1.status).toBe(201);
    expect(unlock1.body.data!.unlocked).toBe(true);
    expect(unlock1.body.data!.balance.total).toBe(10 - cost);

    const unlock2 = await api<{ alreadyUnlocked: boolean; balance: { total: number } }>(
      'POST',
      `/credits/unlock/${episodeId}`,
      { token: accessToken, body: {} },
    );
    expect(unlock2.body.data!.alreadyUnlocked).toBe(true);
    expect(unlock2.body.data!.balance.total).toBe(10 - cost);
  });

  it('05 · HMAC webhook: abonelik aktivasyonu → durum ACTIVE + entitlement; tekrar olay SKIPPED', async () => {
    const { accessToken, userId } = await registerVerified('Faz7 Viewer3', 'faz7-3@perdego.test');
    const webhookPayload = {
      source: 'REVENUECAT',
      eventId: 'faz7-sub-evt-1',
      eventType: 'SUBSCRIPTION_ACTIVATED',
      payload: {
        userId,
        userEmail: 'faz7-3@perdego.test',
        productId: 'SUB_MONTHLY',
        platform: 'IOS',
        storeTransactionId: 'faz7_sub_tx_1',
        storeOriginalTransactionId: 'faz7_orig_1',
      },
    };
    const rawBody = JSON.stringify(webhookPayload);

    const first = await api<{ state: string; duplicate: boolean }>('POST', '/billing/webhooks', {
      headers: { 'X-PerdeGo-Signature': signBody(rawBody) },
      body: webhookPayload as unknown as Record<string, unknown>,
    });
    expect(first.status).toBe(202);
    expect(first.body.data!.state).toBe('PROCESSED');

    // Yeniden gönderim (Güvenlik-4): aynı event SKIPPED, çift işleme yok.
    const second = await api<{ state: string; duplicate: boolean }>('POST', '/billing/webhooks', {
      headers: { 'X-PerdeGo-Signature': signBody(rawBody) },
      body: webhookPayload as unknown as Record<string, unknown>,
    });
    expect(second.body.data!).toMatchObject({ duplicate: true, state: 'SKIPPED' });

    const sub = await api<{
      status: string;
      entitlement: boolean;
      autoRenew: boolean;
    }>('GET', '/billing/subscription', { token: accessToken });
    // Seed'de SUB_MONTHLY deneme dönemi içerir → ilk aktivasyon TRIALING.
    expect(sub.body.data!.status).toBe('TRIALING');
    expect(sub.body.data!.entitlement).toBe(true);
    expect(sub.body.data!.autoRenew).toBe(true);
  });

  it('06 · HMAC imzasız webhook işlenmez (SKIPPED) — Güvenlik-4', async () => {
    const webhookPayload = {
      source: 'REVENUECAT',
      eventId: 'faz7-evt-unsigned',
      eventType: 'SUBSCRIPTION_ACTIVATED',
      payload: { userId: 'x', userEmail: 'x@x.test', productId: 'SUB_MONTHLY', platform: 'IOS', storeTransactionId: 'tx_unsigned' },
    };
    const res = await api<{ state: string }>('POST', '/billing/webhooks', { body: webhookPayload as unknown as Record<string, unknown> });
    expect(res.body.data!.state).toBe('SKIPPED');
  });

  it('07 · iade (Güvenlik-7): kredi paketi REFUND ledger + abonelik EXPIRED', async () => {
    // 7a. Kredi paketi iadesi: harcanmamış bakiye kadar REFUND.
    const { accessToken, userId } = await registerVerified('Faz7 Viewer4', 'faz7-4@perdego.test');
    await api('POST', '/billing/purchases/validate', {
      token: accessToken,
      headers: { 'Idempotency-Key': 'faz7-idem-refund-pack' },
      body: {
        platform: 'ANDROID',
        productType: 'CREDIT_PACK',
        productId: 'perdego.pack.pack_25',
        storeTransactionId: 'faz7_refund_tx_1',
      },
    });
    const beforeRefund = await api<{ wallet: { purchasedCredits: number } }>('GET', '/credits/wallet', {
      token: accessToken,
    });
    expect(beforeRefund.body.data!.wallet.purchasedCredits).toBe(25);

    const refundWebhook = {
      source: 'REVENUECAT',
      eventId: `faz7-refund-evt-${randomUUID()}`,
      eventType: 'PURCHASE_REFUNDED',
      payload: {
        platform: 'ANDROID',
        storeTransactionId: 'faz7_refund_tx_1',
        userId,
        userEmail: 'faz7-4@perdego.test',
      },
    };
    const refundBody = JSON.stringify(refundWebhook);
    const refund = await api<{ state: string }>('POST', '/billing/webhooks', {
      headers: { 'X-PerdeGo-Signature': signBody(refundBody) },
      body: refundWebhook as unknown as Record<string, unknown>,
    });
    expect(refund.body.data!.state).toBe('PROCESSED');

    const afterRefund = await api<{ wallet: { purchasedCredits: number } }>('GET', '/credits/wallet', {
      token: accessToken,
    });
    expect(afterRefund.body.data!.wallet.purchasedCredits).toBe(0);

    // İade olayı ikinci kez gelirse idempotent (REFUND tek ledger satırı).
    const refundRepeat = await api<{ state: string }>('POST', '/billing/webhooks', {
      headers: { 'X-PerdeGo-Signature': signBody(refundBody) },
      body: refundWebhook as unknown as Record<string, unknown>,
    });
    expect(refundRepeat.body.data!).toMatchObject({ duplicate: true, state: 'SKIPPED' });

    // 7b. Abonelik iadesi: EXPIRED + hak kapanır.
    const subWebhook = {
      source: 'REVENUECAT',
      eventId: 'faz7-sub-evt-refund',
      eventType: 'SUBSCRIPTION_ACTIVATED',
      payload: {
        userId,
        userEmail: 'faz7-4@perdego.test',
        productId: 'SUB_YEARLY',
        platform: 'IOS',
        storeTransactionId: 'faz7_sub_tx_refund',
        storeOriginalTransactionId: 'faz7_orig_refund',
      },
    };
    const rawSub = JSON.stringify(subWebhook);
    await api('POST', '/billing/webhooks', {
      headers: { 'X-PerdeGo-Signature': signBody(rawSub) },
      body: subWebhook as unknown as Record<string, unknown>,
    });
    const active = await api<{ status: string; entitlement: boolean }>('GET', '/billing/subscription', {
      token: accessToken,
    });
    expect(active.body.data!.status).toBe('ACTIVE');

    const subRefundWebhook = {
      source: 'REVENUECAT',
      eventId: `faz7-sub-refund-evt-${randomUUID()}`,
      eventType: 'PURCHASE_REFUNDED',
      payload: { platform: 'IOS', storeTransactionId: 'faz7_sub_tx_refund' },
    };
    const subRefundBody = JSON.stringify(subRefundWebhook);
    const subRefund = await api<{ state: string }>('POST', '/billing/webhooks', {
      headers: { 'X-PerdeGo-Signature': signBody(subRefundBody) },
      body: subRefundWebhook as unknown as Record<string, unknown>,
    });
    expect(subRefund.body.data!.state).toBe('PROCESSED');

    const expired = await api<{ status: string; entitlement: boolean }>('GET', '/billing/subscription', {
      token: accessToken,
    });
    expect(expired.body.data!.status).toBe('EXPIRED');
    expect(expired.body.data!.entitlement).toBe(false);
  });

  it('08 · webhook_events: denetim izi — PROCESSED + imzasız SKIPPED + tek satır idempotensi', async () => {
    const db = new Client({ connectionString: TEST_DB_URL });
    await db.connect();
    const processed = await db.query(
      `SELECT COUNT(*)::int AS n FROM webhook_events WHERE state = 'PROCESSED'`,
    );
    const skipped = await db.query(
      `SELECT COUNT(*)::int AS n FROM webhook_events WHERE state = 'SKIPPED' AND "errorMessage" = 'INVALID_SIGNATURE'`,
    );
    // Idempotensi: aynı (source, eventId) için TEK satır — yeniden gönderim
    // yeni satır üretmez (UNIQUE(source, event_id)).
    const dupRows = await db.query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT source, "eventId" FROM webhook_events
         GROUP BY source, "eventId" HAVING COUNT(*) > 1
       ) AS duplicates`,
    );
    await db.end();
    expect(processed.rows[0]!.n).toBeGreaterThanOrEqual(4);
    expect(skipped.rows[0]!.n).toBeGreaterThanOrEqual(1);
    expect(dupRows.rows[0]!.n).toBe(0);
  });
});
