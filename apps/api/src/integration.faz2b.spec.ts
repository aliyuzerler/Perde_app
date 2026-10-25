/**
 * Faz 2b ENTEGRASYON testleri — gerçek PostgreSQL üzerinde uçtan uca akış.
 *
 * Kapsam: temiz test veritabanı (drop + create) → `prisma migrate deploy`
 * (sıfırdan) → seed → gerçek HTTP dinleyicisi (rastgele port) üzerinden
 * kimlik/katalog/kredi/ödeme/oynatma/admin akışları.
 *
 * Çalışma şartı: gömülü/yerel PostgreSQL erişilebilir olmalı. Değilse süreç
 * dürüstçe SKIP edilir (sahte başarı yok — kural: engelli test başarı
 * sayılmaz). CI'da `INTEGRATION_DATABASE_URL` verilerek koşulur.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { execSync, spawnSync } from 'node:child_process';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

const ADMIN_DB_URL = 'postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/postgres';
const TEST_DB = 'perdego_faz2b_test';
const TEST_DB_URL = `postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/${TEST_DB}`;

interface Envelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

let app: INestApplication;
let baseUrl = '';

// DB erişilebilirlik kontrolü üst düzeyde yapılır (skipIf kayıt sırasında
// değerlendirilir; engelli test sahte başarı üretmez, dürüstçe atlanır).
// Not: Probe senkron koşar — dosya CommonJS derlendiğinden üst düzey await
// kullanılamaz; child süreçle kısa bağlantı denemesi yeterlidir.
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
  console.warn('[integration] PostgreSQL erişilemedi — entegrasyon testleri SKIP edilecek.');
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

async function login(email: string, password: string): Promise<string> {
  const { body } = await api<{ tokens: { accessToken: string } }>('POST', '/auth/login', {
    body: { email, password },
  });
  expect(body.ok).toBe(true);
  return body.data!.tokens.accessToken;
}

beforeAll(async () => {
  if (!dbAvailable) return;

  // 1) Temiz test veritabanı: drop + create (sıfırdan doğrulama şartı)
  const admin = new Client({ connectionString: ADMIN_DB_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  // 2) Migration'ları SIFIRDAN uygula (temiz DB doğrulaması)
  execSync(`pnpm exec prisma migrate deploy`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  });

  // 3) Seed
  execSync(`pnpm exec tsx prisma/seed.ts`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  });

  // 4) Uygulamayı gerçek HTTP dinleyicisiyle ayağa kaldır
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DB_URL;
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

describe.skipIf(!dbAvailable)('Faz 2b — uçtan uca entegrasyon (gerçek PostgreSQL)', () => {
  it('01 · health uçları gerçek DB raporlar', async () => {
    const live = await fetch(`${baseUrl}/health`);
    expect(live.status).toBe(200);
    const ready = (await (await fetch(`${baseUrl}/health/db`)).json()) as {
      checks: { database: { status: string } };
    };
    expect(ready.checks.database.status).toBe('up');
  });

  it('02 · /home banner + raylar döner ve TASLAK içerik görünmez (Kural 6)', async () => {
    const { status, body } = await api<{ banners: unknown[]; sections: Array<{ items: Array<{ slug: string }> }> }>(
      'GET',
      '/home',
    );
    expect(status).toBe(200);
    expect(body.data!.banners.length).toBeGreaterThanOrEqual(1);
    expect(body.data!.sections.length).toBeGreaterThanOrEqual(2);
    for (const section of body.data!.sections) {
      for (const item of section.items) {
        expect(item.slug).not.toBe('yeni-baslangic');
      }
    }
  });

  it('03 · /catalog/titles sayfalama + filtreler doğru çalışır', async () => {
    const all = await api<{ items: unknown[]; meta: { totalItems: number; totalPages: number; hasNextPage: boolean } }>(
      'GET',
      '/catalog/titles?pageSize=4',
    );
    expect(all.status).toBe(200);
    expect(all.body.data!.items).toHaveLength(4);
    expect(all.body.data!.meta.totalItems).toBe(6);
    expect(all.body.data!.meta.totalPages).toBe(2);
    expect(all.body.data!.meta.hasNextPage).toBe(true);

    const series = await api<{ items: Array<{ kind: string }>; meta: { totalItems: number } }>(
      'GET',
      '/catalog/titles?kind=SERIES',
    );
    expect(series.body.data!.meta.totalItems).toBe(3);
    for (const item of series.body.data!.items) expect(item.kind).toBe('SERIES');

    const dram = await api<{ items: Array<{ slug: string }>; meta: { totalItems: number } }>(
      'GET',
      '/catalog/titles?category=dram&pageSize=50',
    );
    expect(dram.body.data!.meta.totalItems).toBeGreaterThanOrEqual(3);
    expect(dram.body.data!.items.some((i) => i.slug === 'yeni-baslangic')).toBe(false);
  });

  it('04 · /catalog/titles/:slug detayı sezonlu bölüm listesi verir; taslak 404', async () => {
    const detail = await api<{
      slug: string;
      accessSeasons: Array<{ seasonNumber: number; episodes: Array<{ creditCost: number | null; access?: { reason: string } }> }>;
    }>('GET', '/catalog/titles/gizli-bahce');
    expect(detail.status).toBe(200);
    expect(detail.body.data!.accessSeasons).toHaveLength(2);
    const s1e2 = detail.body.data!.accessSeasons
      .find((s) => s.seasonNumber === 1)!
      .episodes.find((e) => e.creditCost === 2);
    expect(s1e2).toBeDefined();

    const draft = await api('GET', '/catalog/titles/yeni-baslangic');
    expect(draft.status).toBe(404);
    expect(draft.body.error?.details?.reason).toBe('CONTENT_NOT_FOUND');
  });

  it('05 · /search arama yapar; boş sonuç sayfalı döner', async () => {
    const hit = await api<{ items: Array<{ slug: string }>; meta: { totalItems: number } }>(
      'GET',
      '/search?query=tren',
    );
    expect(hit.status).toBe(200);
    expect(hit.body.data!.items.some((i) => i.slug === 'gece-yarisi-treni')).toBe(true);

    const miss = await api<{ items: unknown[]; meta: { totalItems: number } }>(
      'GET',
      '/search?query=olmayan-bir-sey-xyz',
    );
    expect(miss.body.data!.meta.totalItems).toBe(0);
  });

  it('06 · /catalog/episodes/:id konuğa FREE erişim kararı verir', async () => {
    const detail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string }> }> }>(
      'GET',
      '/catalog/titles/kayip-sinyal',
    );
    const episodes = detail.body.data!.accessSeasons[0]!.episodes;
    expect(episodes).toHaveLength(1);
    const episodeId = episodes[0]!.id;
    const ep = await api<{ access: { canPlay: boolean; reason: string }; content: { slug: string } }>(
      'GET',
      `/catalog/episodes/${episodeId}`,
    );
    expect(ep.status).toBe(200);
    expect(ep.body.data!.access.canPlay).toBe(true);
    expect(ep.body.data!.access.reason).toBe('FREE');
    expect(ep.body.data!.content.slug).toBe('kayip-sinyal');
  });

  it('07 · kayıt: geçerli istek → token; zayıf şifre → 400; aynı e-posta → 409', async () => {
    const email = `qa-${randomUUID().slice(0, 8)}@perdego.dev`;
    const ok = await api<{ user: { email: string }; tokens: { refreshToken: string } }>('POST', '/auth/register', {
      body: { displayName: 'QA Kullanıcı', email, password: 'Qa123456', locale: 'tr' },
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data!.user.email).toBe(email);

    const weak = await api('POST', '/auth/register', {
      body: { displayName: 'QA', email: `w-${randomUUID().slice(0, 6)}@perdego.dev`, password: 'sadeceharf' },
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error?.details?.reason).toBe('VALIDATION_FAILED');

    const dup = await api('POST', '/auth/register', {
      body: { displayName: 'QA Kopya', email, password: 'Qa123456' },
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error?.details?.reason).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('08 · yanlış şifre → 401 BAD_CREDENTIALS', async () => {
    const res = await api('POST', '/auth/login', {
      body: { email: 'viewer@perdego.dev', password: 'YanlisSifre1' },
    });
    expect(res.status).toBe(401);
    expect(res.body.error?.details?.reason).toBe('BAD_CREDENTIALS');
  });

  it('09 · refresh rotasyonu + reuse detection tüm aileyi iptal eder (SECURITY.md)', async () => {
    const email = `rot-${randomUUID().slice(0, 8)}@perdego.dev`;
    const reg = await api<{ tokens: { refreshToken: string } }>('POST', '/auth/register', {
      body: { displayName: 'Rotasyon QA', email, password: 'Qa123456' },
    });
    const first = reg.body.data!.tokens.refreshToken;

    const rotated = await api<{ tokens: { accessToken: string; refreshToken: string } }>('POST', '/auth/refresh', {
      body: { refreshToken: first },
    });
    expect(rotated.status).toBe(201);
    const second = rotated.body.data!.tokens.refreshToken;

    // ESKİ token yeniden kullanılırsa: aile iptal edilir.
    const reuse = await api('POST', '/auth/refresh', { body: { refreshToken: first } });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error?.details?.reason).toBe('REFRESH_REUSED');

    // Rotasyonla alınan YENİ token da artık geçersizdir (aile iptali).
    const afterReuse = await api('POST', '/auth/refresh', { body: { refreshToken: second } });
    expect(afterReuse.status).toBe(401);
  });

  it('10 · profil okuma + güncelleme (GET/PATCH /me)', async () => {
    const token = await login('viewer@perdego.dev', 'Dev12345');
    const me = await api<{ displayName: string; maskedEmail: string }>('GET', '/me', { token });
    expect(me.body.data!.maskedEmail).toBe('v*****@perdego.dev');

    const patched = await api<{ displayName: string; preferredLocale: string }>('PATCH', '/me', {
      token,
      body: { displayName: 'Demo İzleyici 2', locale: 'en' },
    });
    expect(patched.body.data!.displayName).toBe('Demo İzleyici 2');
    expect(patched.body.data!.preferredLocale).toBe('en');
  });

  it('11 · izleme ilerlemesi: upsert + devam et listesi', async () => {
    const token = await login('viewer@perdego.dev', 'Dev12345');
    const detail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string }> }> }>(
      'GET',
      '/catalog/titles/son-vardiya',
    );
    const epId = detail.body.data!.accessSeasons[0]!.episodes[0]!.id;

    const save = await api<{ saved: boolean; completed: boolean }>('PUT', `/watch-progress/${epId}`, {
      token,
      body: { positionSeconds: 120 },
    });
    expect(save.body.data!.saved).toBe(true);
    expect(save.body.data!.completed).toBe(false);

    const list = await api<{ items: Array<{ episodeId: string; durationSeconds: number }> }>(
      'GET',
      '/watch-progress',
      { token },
    );
    expect(list.body.data!.items.some((i) => i.episodeId === epId)).toBe(true);
    const row = list.body.data!.items.find((i) => i.episodeId === epId)!;
    expect(row.durationSeconds).toBeGreaterThan(0);

    const single = await api<{ positionSeconds: number }>('GET', `/watch-progress/${epId}`, { token });
    expect(single.body.data!.positionSeconds).toBe(120);
  });

  it('12 · favoriler: ekle (idempotent) + liste + çıkar', async () => {
    const token = await login('viewer@perdego.dev', 'Dev12345');
    const add1 = await api<{ favorited: boolean; alreadyFavorited: boolean }>('POST', '/watchlist/yanki', { token });
    expect(add1.body.data!.favorited).toBe(true);
    expect(add1.body.data!.alreadyFavorited).toBe(false);
    const add2 = await api<{ alreadyFavorited: boolean }>('POST', '/watchlist/yanki', { token });
    expect(add2.body.data!.alreadyFavorited).toBe(true);

    const list = await api<{ items: Array<{ slug: string }> }>('GET', '/watchlist', { token });
    expect(list.body.data!.items.some((i) => i.slug === 'yanki')).toBe(true);

    const remove = await api<{ favorited: boolean }>('DELETE', '/watchlist/yanki', { token });
    expect(remove.body.data!.favorited).toBe(false);
    const removeAgain = await api<{ favorited: boolean; alreadyFavorited: boolean }>(
      'DELETE',
      '/watchlist/yanki',
      { token },
    );
    expect(removeAgain.body.data!.favorited).toBe(false);
    expect(removeAgain.body.data!.alreadyFavorited).toBe(false);
  });

  it('13 · kredi akışı (Kural 3/4): yetersiz → 402, admin düzeltmesi, unlock, tekrar unlock ücretlendirmez; ledger = cüzdan', async () => {
    const email = `credit-${randomUUID().slice(0, 8)}@perdego.dev`;
    const reg = await api<{ tokens: { accessToken: string } }>('POST', '/auth/register', {
      body: { displayName: 'Kredi QA', email, password: 'Qa123456' },
    });
    const token = reg.body.data!.tokens.accessToken;

    const detail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string; creditCost: number | null }> }> }>(
      'GET',
      '/catalog/titles/gizli-bahce',
    );
    const target = detail.body.data!.accessSeasons
      .flatMap((s) => s.episodes)
      .find((e) => e.creditCost === 2)!;

    // 0 bakiye → 402 INSUFFICIENT_CREDITS + details.balance
    const denied = await api<{ unlocked?: boolean }>('POST', `/credits/unlock/${target.id}`, { token, body: {} });
    expect(denied.status).toBe(402);
    expect(denied.body.error?.details?.reason).toBe('INSUFFICIENT_CREDITS');
    expect(denied.body.error?.details?.creditCost).toBe(2);

    // ADMIN düzeltmesi: +25 kredi (note zorunlu) → audit log
    const adminToken = await login('admin@perdego.dev', 'Admin12345');
    const userId = (await api<{ id: string }>('GET', '/me', { token })).body.data!.id;
    const adjust = await api<{ wallet: { granted: number } }>(
      'POST',
      `/admin/users/${userId}/credits/adjust`,
      {
        token: adminToken,
        body: { grantedDelta: 25, note: 'Entegrasyon QA hediyesi' },
      },
    );
    expect(adjust.status).toBe(201);
    expect(adjust.body.data!.wallet.granted).toBe(25);

    // unlock → bakiye 23
    const unlock1 = await api<{ unlocked: boolean; alreadyUnlocked: boolean; balance: { total: number; granted: number } }>(
      'POST',
      `/credits/unlock/${target.id}`,
      { token, body: {} },
    );
    expect(unlock1.body.data!.alreadyUnlocked).toBe(false);
    expect(unlock1.body.data!.balance.granted).toBe(23);

    // tekrar unlock → alreadyUnlocked=true, bakiye DEĞİŞMEZ (Kural 3)
    const unlock2 = await api<{ alreadyUnlocked: boolean; balance: { granted: number } }>(
      'POST',
      `/credits/unlock/${target.id}`,
      { token, body: {} },
    );
    expect(unlock2.body.data!.alreadyUnlocked).toBe(true);
    expect(unlock2.body.data!.balance.granted).toBe(23);

    // Kural 1: ledger toplamı == cüzdan
    const { Client } = await import('pg');
    const client = new Client({ connectionString: TEST_DB_URL });
    await client.connect();
    const sums = await client.query<{ p: string; g: string; wp: number; wg: number }>(
      `SELECT
         (SELECT COALESCE(SUM("purchasedDelta"),0) FROM credit_ledger WHERE "userId"=$1) AS p,
         (SELECT COALESCE(SUM("grantedDelta"),0)  FROM credit_ledger WHERE "userId"=$1) AS g,
         (SELECT "purchasedBalance" FROM credit_wallets WHERE "userId"=$1) AS wp,
         (SELECT "grantedBalance"  FROM credit_wallets WHERE "userId"=$1) AS wg`,
      [userId],
    );
    await client.end();
    const row = sums.rows[0]!;
    expect(row.p).toBe(String(row.wp));
    expect(row.g).toBe(String(row.wg));
  });

  it('14 · ödeme: aynı Idempotency-Key aynı yanıt; aynı store tx farklı key → alreadyProcessed (Kural 2)', async () => {
    const token = await login('viewer@perdego.dev', 'Dev12345');
    const dto = {
      platform: 'IOS' as const,
      productType: 'CREDIT_PACK' as const,
      productId: 'PACK_10',
      storeTransactionId: `int-tx-${randomUUID().slice(0, 8)}`,
    };
    const before = (await api<{ wallet: { purchasedCredits: number } }>('GET', '/credits/wallet', { token })).body.data!
      .wallet.purchasedCredits;

    const firstKey = randomUUID();
    const first = await api<{ alreadyProcessed: boolean; wallet: { purchased: number } }>(
      'POST',
      '/billing/purchases/validate',
      { token, body: dto, headers: { 'Idempotency-Key': firstKey } },
    );
    expect(first.body.data!.alreadyProcessed).toBe(false);
    // Not: satın alma yanıtı sözleşmede wallet.{purchased,granted}; cüzdan ucu ise
    // purchasedCredits kullanır (payments.ts / billing.ts — iki ayrı sözleşme).
    expect(first.body.data!.wallet.purchased).toBe(before + 10);

    // Aynı key + aynı gövde: kayıtlı yanıt AYNEN döner, bakiye değişmez (BR-06).
    const sameKeyRaw = await fetch(`${baseUrl}/api/v1/billing/purchases/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': firstKey,
      },
      body: JSON.stringify(dto),
    });
    expect(sameKeyRaw.status).toBe(201);
    const sameKeyBody = (await sameKeyRaw.json()) as Envelope<{ alreadyProcessed: boolean; wallet: { purchased: number } }>;
    expect(sameKeyBody.data!.alreadyProcessed).toBe(false); // kayıtlı yanıt
    expect(sameKeyBody.data!.wallet.purchased).toBe(before + 10); // ikinci yazım yok

    const replay = await api<{ alreadyProcessed: boolean; wallet: { purchased: number } }>(
      'POST',
      '/billing/purchases/validate',
      { token, body: dto, headers: { 'Idempotency-Key': `ikinci-${randomUUID()}` } },
    );
    expect(replay.body.data!.alreadyProcessed).toBe(true);
    expect(replay.body.data!.wallet.purchased).toBe(before + 10); // çift yazım yok

    // Key olmadan → 400 (BR-06 zorunluluğu)
    const noKey = await api('POST', '/billing/purchases/validate', { token, body: dto });
    expect(noKey.status).toBe(400);
  });

  it('15 · webhook idempotent (Kural 7): ikinci aynı olay SKIPPED, abonelik/iade akışları ayrı', async () => {
    const email = `wh-${randomUUID().slice(0, 8)}@perdego.dev`;
    const reg = await api<{ user: { id: string } }>('POST', '/auth/register', {
      body: { displayName: 'Webhook QA', email, password: 'Qa123456' },
    });
    const userId = reg.body.data!.user.id;
    const eventId = `evt-${randomUUID().slice(0, 8)}`;
    const payload = {
      userId,
      userEmail: email,
      productId: 'PACK_10',
      platform: 'ANDROID',
      storeTransactionId: `wh-tx-${randomUUID().slice(0, 8)}`,
    };

    const first = await api<{ state: string; duplicate: boolean }>('POST', '/billing/webhooks', {
      body: { source: 'GOOGLE', eventId, eventType: 'CREDIT_PACK_PURCHASED', payload },
    });
    expect(first.body.data!.state).toBe('PROCESSED');

    const second = await api<{ state: string; duplicate: boolean }>('POST', '/billing/webhooks', {
      body: { source: 'GOOGLE', eventId, eventType: 'CREDIT_PACK_PURCHASED', payload },
    });
    expect(second.body.data!.duplicate).toBe(true);
    expect(second.body.data!.state).toBe('SKIPPED');
  });

  it('16 · oynatma: konuk FREE oturum + imzalı manifest; aboneliksiz SUBSCRIPTION → 402; paralel limit → 409 (Kural 5)', async () => {
    // Konuk FREE
    const freeDetail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string }> }> }>(
      'GET',
      '/catalog/titles/kayip-sinyal',
    );
    const freeEp = freeDetail.body.data!.accessSeasons[0]!.episodes[0]!.id;
    const guest = await api<{ playbackUrl: string; guest: boolean }>(
      'POST',
      `/media/playback/${freeEp}/session`,
    );
    expect(guest.body.data!.guest).toBe(true);
    const manifest = await fetch(guest.body.data!.playbackUrl);
    expect(manifest.status).toBe(200);

    // Aboneliksiz kullanıcı → SUBSCRIPTION bölüm 402 NEEDS_SUBSCRIPTION
    const email = `play-${randomUUID().slice(0, 8)}@perdego.dev`;
    const reg = await api<{ tokens: { accessToken: string } }>('POST', '/auth/register', {
      body: { displayName: 'Oynatma QA', email, password: 'Qa123456' },
    });
    const token = reg.body.data!.tokens.accessToken;
    const subDetail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string; accessType: string }> }> }>(
      'GET',
      '/catalog/titles/son-vardiya',
    );
    // Açıkça SUBSCRIPTION bölüm seç (S1E1 FREE — ilk bölüm konuk akışına bırakıldı).
    const subEp = subDetail.body.data!.accessSeasons[0]!.episodes.find((e) => e.accessType === 'SUBSCRIPTION')!;
    const denied = await api('POST', `/media/playback/${subEp.id}/session`, { token });
    expect(denied.status).toBe(402);
    expect(denied.body.error?.details?.reason).toBe('NEEDS_SUBSCRIPTION');

    // Abonelik aktive edilir (simüle mağaza doğrulaması) → oturum açılır
    const validate = await api('POST', '/billing/purchases/validate', {
      token,
      headers: { 'Idempotency-Key': randomUUID() },
      body: {
        platform: 'IOS',
        productType: 'SUBSCRIPTION',
        productId: 'SUB_MONTHLY',
        storeTransactionId: `sub-tx-${randomUUID().slice(0, 8)}`,
      },
    });
    expect(validate.status).toBe(201);
    const allowed = await api<{ playbackUrl: string }>(`POST`, `/media/playback/${subEp.id}/session`, { token });
    expect(allowed.status).toBe(201);

    // Paralel limit (2): 1. ve 2. oturum açılır; 3. oturum → 409 PLAYBACK_LIMIT_REACHED
    const second = await api<{ playbackUrl: string }>('POST', `/media/playback/${subEp.id}/session`, { token });
    expect(second.status).toBe(201);
    const third = await api('POST', `/media/playback/${subEp.id}/session`, { token });
    expect(third.status).toBe(409);
    expect(third.body.error?.details?.reason).toBe('PLAYBACK_LIMIT_REACHED');
  });

  it('17 · admin: rol koruması + taslak→yayın ayrımı (Kural 6) + audit log', async () => {
    const viewer = await login('viewer@perdego.dev', 'Dev12345');
    const denied = await api('GET', '/admin/audit-logs', { token: viewer });
    expect(denied.status).toBe(403);
    expect(denied.body.error?.details?.reason).toBe('ADMIN_ONLY');

    const admin = await login('admin@perdego.dev', 'Admin12345');
    const logs = await api<{ items: Array<{ action: string }> }>('GET', '/admin/audit-logs?pageSize=10', {
      token: admin,
    });
    expect(logs.body.data!.items.some((l) => l.action === 'CREDIT_ADJUSTMENT')).toBe(true);

    // Taslak oluştur → herkese açık uçlarda 404 → yayınla → 200
    const slug = `qa-dizi-${randomUUID().slice(0, 6)}`;
    const created = await api<{ id: string; status: string }>('POST', '/admin/titles', {
      token: admin,
      body: {
        slug,
        kind: 'SERIES',
        seriesFormat: 'MINI',
        titleTr: 'QA Dizisi',
        titleEn: 'QA Series',
        synopsisTr: 'Test için oluşturulmuş taslak dizi.',
        synopsisEn: 'Draft series created for testing.',
        releaseYear: 2026,
        accessType: 'FREE',
        categorySlugs: ['dram'],
      },
    });
    expect(created.body.data!.status).toBe('DRAFT');

    const before = await api('GET', `/catalog/titles/${slug}`);
    expect(before.status).toBe(404);

    const published = await api<{ status: string }>('POST', `/admin/titles/${created.body.data!.id}/publish`, {
      token: admin,
    });
    expect(published.body.data!.status).toBe('PUBLISHED');

    const after = await api<{ slug: string }>('GET', `/catalog/titles/${slug}`);
    expect(after.status).toBe(200);
    expect(after.body.data!.slug).toBe(slug);
  });

  it('18 · credit_ledger append-only DB tetikleyicisi: finansal UPDATE/DELETE reddedilir, snapshot güncellemesi serbest (BR-04)', async () => {
    const client = new Client({ connectionString: TEST_DB_URL });
    await client.connect();
    try {
      const before = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM credit_ledger');
      const target = await client.query<{ id: string }>('SELECT id FROM credit_ledger LIMIT 1');
      expect(target.rows.length).toBe(1);
      const id = target.rows[0]!.id;

      // 1) Finansal alan güncellemesi reddedilir (delta değiştirilemez).
      await expect(client.query(`UPDATE credit_ledger SET delta = delta + 1 WHERE id = $1`, [id])).rejects.toThrow(
        /append-only.*finansal|finansal.*append-only|append-only/s,
      );

      // 2) type/purchasedDelta gibi öz kimlik alanları da değişemez
      //    (kesin farklı değer: mevcut değerden bağımsız değişim yaratır).
      await expect(
        client.query(`UPDATE credit_ledger SET "purchasedDelta" = -777 WHERE id = $1`, [id]),
      ).rejects.toThrow(/append-only/s);

      // 3) Satır silme reddedilir.
      await expect(client.query(`DELETE FROM credit_ledger WHERE id = $1`, [id])).rejects.toThrow(/append-only/s);

      // 4) Bakiye snapshot alanları güncellenebilir (credits.service finalize deseni).
      await client.query(
        `UPDATE credit_ledger SET "balanceAfterPurchased" = "balanceAfterPurchased", "balanceAfterGranted" = "balanceAfterGranted" WHERE id = $1`,
        [id],
      );

      // 5) Veri bütünlüğü: satır sayısı değişmedi, delta dokunulmadı.
      const after = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM credit_ledger');
      expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
    } finally {
      await client.end();
    }
  });
});
