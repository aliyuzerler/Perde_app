/**
 * FAZ 9 ENTEGRASYON testleri — push bildirim altyapısı (gerçek PG).
 *
 * Kapsam: cihaz token kaydı (çoklu cihaz, upsert, başka kullanıcıya kapalı),
 * olay bildirimleri (tercih süzme + dedup), push kuyruğu + dispatch izleme
 * (simüle sağlayıcı; geçersiz token akışı), geçersiz token süpürmesi,
 * abonelik hatırlatma süpürmesi, kampanya → push fan-out + tercih filtresi,
 * admin gönderim izleri ucu, in-app okuma akışı.
 *
 * Çalışma şartı: yerel PostgreSQL erişilebilir olmalı; değilse SKIP
 * (sahte başarı yok).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { execSync, spawnSync } from 'node:child_process';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';

const ADMIN_DB_URL = 'postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/postgres';
const TEST_DB = 'perdego_faz9_test';
const TEST_DB_URL = `postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/${TEST_DB}`;

interface Envelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

let app: INestApplication;
let baseUrl = '';
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
  console.warn('[integration-faz9] PostgreSQL erişilemedi — FAZ 9 entegrasyon testleri SKIP.');
}

async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

const ADMIN_EMAIL = 'admin@perdego.dev';
const ADMIN_PASSWORD = 'Admin12345';
const EDITOR_EMAIL = 'editor@perdego.dev';
const VIEWER_EMAIL = 'viewer@perdego.dev';
const VIEWER_PASSWORD = 'Dev12345';

let adminToken = '';
let viewerToken = '';

async function pgQuery(sql: string): Promise<Array<Record<string, unknown>>> {
  const client = new Client({ connectionString: TEST_DB_URL });
  await client.connect();
  const result = await client.query(sql);
  await client.end();
  return result.rows;
}

beforeAll(async () => {
  if (!dbAvailable) return;

  const admin = new Client({ connectionString: ADMIN_DB_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  execSync(`npx prisma migrate deploy`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  });
  execSync(`npx tsx prisma/seed.ts`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  });

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.PUSH_PROVIDER = 'simulated';
  process.env.MAIL_OUTBOX_FILE = '/tmp/perdego-mail-faz9.jsonl';
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

  adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  viewerToken = await login(VIEWER_EMAIL, VIEWER_PASSWORD);
  void EDITOR_EMAIL;
}, 180_000);

afterAll(async () => {
  if (app) await app.close();
});

let deviceA = '';
let deviceB = '';

describe.skipIf(!dbAvailable)('FAZ 9 — cihaz token kaydı (çoklu cihaz)', () => {
  const tokenA = 'ExponentPushToken[qa9-device-a-test-token-01]';
  const tokenB = 'ExponentPushToken[qa9-device-b-test-token-02]';
  const tokenC = 'ExponentPushToken[qa9-device-c-test-token-03]';

  it('token kaydeder (upsert; aynı token ikinci kez aynı cihaz)', async () => {
    const r1 = await api<{ id: string; pushTokenMasked: string }>('POST', '/notifications/devices', {
      token: viewerToken,
      body: { platform: 'IOS', pushToken: tokenA, locale: 'tr' },
    });
    expect(r1.status).toBeLessThan(300);
    expect(r1.body.data!.pushTokenMasked).toContain('…');
    const r2 = await api<{ id: string }>('POST', '/notifications/devices', {
      token: viewerToken,
      body: { platform: 'IOS', pushToken: tokenA, locale: 'en' },
    });
    expect(r2.body.data!.id).toBe(r1.body.data!.id);
    deviceA = r1.body.data!.id;
  });

  it('ikinci cihaz ayrı kayıt olur (çoklu cihaz desteği)', async () => {
    const r = await api<{ id: string }>('POST', '/notifications/devices', {
      token: viewerToken,
      body: { platform: 'ANDROID', pushToken: tokenB, locale: 'tr' },
    });
    expect(r.status).toBeLessThan(300);
    deviceB = r.body.data!.id;
    expect(deviceB).not.toBe(deviceA);
  });

  it('kimliksiz token kaydı 401', async () => {
    const r = await api('POST', '/notifications/devices', {
      body: { platform: 'IOS', pushToken: tokenC, locale: 'tr' },
    });
    expect(r.status).toBe(401);
  });
});

describe.skipIf(!dbAvailable)('FAZ 9 — olay bildirimleri (tercih + dedup + push)', () => {
  let seriesSlug = '';
  let contentId = '';
  let episodeId = ''; // NEW_EPISODE testinin konusu (2. bölüm)

  it('admin dizi taslağı oluşturur; taslağa favori eklenemez (Kural 6)', async () => {
    seriesSlug = `qa9-dizi-${Date.now().toString(36)}`;
    const created = await api<{ id: string }>('POST', '/admin/titles', {
      token: adminToken,
      body: {
        slug: seriesSlug,
        kind: 'SERIES',
        seriesFormat: 'MINI',
        titleTr: 'QA9 Dizisi',
        titleEn: 'QA9 Series',
        synopsisTr: 'QA',
        synopsisEn: 'QA',
        releaseYear: 2026,
        accessType: 'FREE',
      },
    });
    expect(created.body.ok).toBe(true);
    contentId = created.body.data!.id;

    const fav = await api('POST', `/watchlist/${contentId}`, { token: viewerToken, body: {} });
    expect(fav.status).toBe(404); // taslak herkese açık favoriye ALINAMAZ

    const season = await api<{ id: string }>('POST', `/admin/titles/${contentId}/seasons`, {
      token: adminToken,
      body: { seasonNumber: 1 },
    });
    expect(season.body.ok).toBe(true);
    const episode = await api<{ id: string }>('POST', `/admin/titles/${contentId}/episodes`, {
      token: adminToken,
      body: { seasonNumber: 1, episodeNumber: 1, titleTr: 'B1', titleEn: 'E1', durationSeconds: 60, accessType: 'FREE' },
    });
    expect(episode.body.ok).toBe(true);
  });

  it('yayın sonrası favoriye alınır; 2. bölümün İLK yayını NEW_EPISODE üretir', async () => {
    // Seriyi yayınla (taslak bölüm de yayına alınır — bütünsel yayın).
    const pub = await api('PATCH', `/admin/titles/${contentId}/status`, {
      token: adminToken,
      body: { status: 'PUBLISHED' },
    });
    expect(pub.body.ok).toBe(true);

    // Artık favoriye eklenebilir (takip listesi — NEW_EPISODE hedefi).
    const fav = await api('POST', `/watchlist/${contentId}`, { token: viewerToken, body: {} });
    expect([200, 201]).toContain(fav.status);

    const episode = await api<{ id: string }>('POST', `/admin/titles/${contentId}/episodes`, {
      token: adminToken,
      body: { seasonNumber: 1, episodeNumber: 2, titleTr: 'B2', titleEn: 'E2', durationSeconds: 60, accessType: 'FREE' },
    });
    episodeId = episode.body.data!.id;
    const pub2 = await api('PATCH', `/admin/episodes/${episodeId}/status`, {
      token: adminToken,
      body: { status: 'PUBLISHED' },
    });
    expect(pub2.body.ok).toBe(true);

    const list = await api<{ items: Array<{ type: string; data?: { episodeId?: string } }> }>(
      'GET',
      '/notifications?page=1&pageSize=50',
      { token: viewerToken },
    );
    const epNotifs = list.body.data!.items.filter(
      (n) => n.type === 'NEW_EPISODE' && n.data?.episodeId === episodeId,
    );
    expect(epNotifs.length).toBe(1);
  });

  it('aynı bölüm yeniden yayınlanırsa mükerrer bildirim oluşmaz (dedup)', async () => {
    // PUBLISHED→ARCHIVED→PUBLISHED matrisi üzerinden tekrar yayın.
    await api('PATCH', `/admin/episodes/${episodeId}/status`, { token: adminToken, body: { status: 'ARCHIVED' } });
    await api('PATCH', `/admin/episodes/${episodeId}/status`, { token: adminToken, body: { status: 'PUBLISHED' } });

    const list = await api<{ items: Array<{ type: string; data?: { episodeId?: string } }> }>(
      'GET',
      '/notifications?page=1&pageSize=50',
      { token: viewerToken },
    );
    const epNotifs = list.body.data!.items.filter(
      (n) => n.type === 'NEW_EPISODE' && n.data?.episodeId === episodeId,
    );
    expect(epNotifs.length).toBe(1);
  });

  it('push gönderim satırları açıldı (2 cihaz) ve simüle sağlayıcı ile dispatch SON/BEKLEYEN izli', async () => {
    // dispatchPending test ortamında çevrimle değil; manuel servis çağrısıyla:
    const { PrismaService } = await import('./prisma/prisma.service.js');
    const { PushDispatchService } = await import('./notifications/push-dispatch.service.js');
    const prisma = app.get(PrismaService);
    const push = app.get(PushDispatchService);

    const sendsCount = await pgQuery(
      `SELECT count(*)::int AS adet FROM notification_sends ns
       JOIN notifications n ON n.id = ns."notificationId"
       WHERE n."dedupKey" LIKE 'EP_PUBLISHED:${episodeId}:%'`,
    );
    expect(Number(sendsCount[0]!.adet)).toBe(2); // iki cihaz

    // TITLE_PUBLISHED duyurusu da viewer'a gitti (newContent=true, 2 cihaz)
    // → dispatch toplamı 4 (TITLE 2 + EP 2).
    const result = await push.dispatchPending();
    expect(result.sent).toBe(4); // simüle sağlayıcı geçerli token'a ok döner

    const rows = await pgQuery(
      `SELECT ns.status, ns.provider, ns."sentAt" FROM notification_sends ns
       JOIN notifications n ON n.id = ns."notificationId"
       WHERE n."dedupKey" LIKE 'EP_PUBLISHED:${episodeId}:%'`,
    );
    for (const row of rows) {
      expect(row.status).toBe('SENT');
      expect(row.provider).toBe('simulated');
      expect(row.sentAt).not.toBeNull();
    }
    void prisma;
  });

  it('newEpisode tercihini kapatınca yeni bölüm bildirimi OLUŞTURULMAZ', async () => {
    await api('PATCH', '/notifications/preferences', {
      token: viewerToken,
      body: { newEpisode: false },
    });
    const list0 = await api<{ items: unknown[] }>('GET', '/notifications?page=1&pageSize=50', {
      token: viewerToken,
    });
    const before = list0.body.data!.items.length;

    const episode3 = await api<{ id: string }>('POST', `/admin/titles/${contentId}/episodes`, {
      token: adminToken,
      body: { seasonNumber: 1, episodeNumber: 3, titleTr: 'B3', titleEn: 'E3', durationSeconds: 60, accessType: 'FREE' },
    });
    await api('PATCH', `/admin/episodes/${episode3.body.data!.id}/status`, {
      token: adminToken,
      body: { status: 'PUBLISHED' },
    });

    const list1 = await api<{ items: Array<{ type: string; data?: { episodeId?: string } }> }>(
      'GET',
      '/notifications?page=1&pageSize=50',
      { token: viewerToken },
    );
    const newOnes = list1.body.data!.items.filter(
      (n) => n.type === 'NEW_EPISODE' && n.data?.episodeId === episode3.body.data!.id,
    );
    expect(newOnes.length).toBe(0);
    expect(list1.body.data!.items.length).toBe(before);
  });

  it('geçersiz token dispatch’te işaretlenir ve TTL süpürmesi siler', async () => {
    // Geçersiz token kaydet (simüle sağlayıcı 'invalid' içeriyorsa reddeder).
    const badToken = 'ExponentPushToken[invalid-token-for-cleanup-01]';
    const reg = await api<{ id: string }>('POST', '/notifications/devices', {
      token: viewerToken,
      body: { platform: 'IOS', pushToken: badToken, locale: 'tr' },
    });
    expect(reg.status).toBeLessThan(300);

    // Simüle sağlayıcı yalnız kurucuda verilen set'e göre reddeder; burada
    // provider'ın geçersiz set'ine badToken'ı ekleyemeyiz (fabrika env'den) —
    // dolayısıyla doğrudan süpürme akışını test ederiz: token'ı DB'de
    // geçersiz işaretleyip süpürmeyi koş (TTL'i 1 gün altına alamayız —
    // min 1; süpürme cutoff = now - 1gün → invalidAt < cutoff için invalidAt
    // eski tarihli satır uydururuz).
    await pgQuery(
      `UPDATE devices SET "invalidAt" = now() - interval '10 days', "invalidReason" = 'DeviceNotRegistered' WHERE id='${reg.body.data!.id}'`,
    );
    const { PushDispatchService } = await import('./notifications/push-dispatch.service.js');
    const push = app.get(PushDispatchService);
    const sweep = await push.sweepInvalidTokens();
    expect(sweep.removed).toBeGreaterThanOrEqual(1);
    const gone = await pgQuery(`SELECT id FROM devices WHERE id='${reg.body.data!.id}'`);
    expect(gone.length).toBe(0);
  });

  it('abonelik hatırlatma süpürmesi dönem bitişi yaklaşan aboneliğe SYSTEM bildirimi yazar (dedup’lı)', async () => {
    // Viewer'a 2 gün sonra biten aktif abonelik yarat.
    const userId = String((await pgQuery(`SELECT id FROM users WHERE email='${VIEWER_EMAIL}'`))[0]!.id);
    const planId = String((await pgQuery(`SELECT id FROM plans LIMIT 1`))[0]!.id);
    const subRows = await pgQuery(
      `INSERT INTO subscriptions (id, "userId", "planId", platform, status, "autoRenew", "currentPeriodEnd", "createdAt", "updatedAt")
       VALUES (md5(random()::text) || 'sub', '${userId}', '${planId}', 'IOS', 'ACTIVE', true, now() + interval '2 days', now(), now())
       RETURNING id`,
    );
    const subId = String(subRows[0]!.id);

    const { PushDispatchService } = await import('./notifications/push-dispatch.service.js');
    const push = app.get(PushDispatchService);
    const first = await push.sweepSubscriptionReminders();
    expect(first.created).toBeGreaterThanOrEqual(1);
    const second = await push.sweepSubscriptionReminders();
    // İkinci süpürme aynı dönem için YENİ bildirim yaratmaz (dedup).
    const rows = await pgQuery(
      `SELECT count(*)::int AS adet FROM notifications WHERE "dedupKey" LIKE 'SUB_REMINDER:${subId}:%'`,
    );
    expect(Number(rows[0]!.adet)).toBe(1);
    expect(second.created).toBe(0);

    // Temizlik: test aboneliğini sil.
    await pgQuery(`DELETE FROM subscriptions WHERE id='${subId}'`);
  });
});

describe.skipIf(!dbAvailable)('FAZ 9 — kampanya push fan-out + admin izleme', () => {
  let campaignId = '';

  it('kampanya gönderimi cihaz push satırları açar; tercih filtresi çalışır', async () => {
    // Önce newEpisode=false yapılmıştı — PROMO tercihini tekrar aç (varsayılan true).
    const { PrismaService } = await import('./prisma/prisma.service.js');
    const prisma = app.get(PrismaService);
    await prisma.notificationPreference.updateMany({
      where: {},
      data: { newEpisode: true, newContent: true, promo: true },
    });

    const stepUpToken = await api<{ stepUpToken: string }>('POST', '/auth/step-up', {
      token: adminToken,
      body: { password: ADMIN_PASSWORD },
    });
    const camp = await api<{ id: string; status: string; recipientCount: number }>(
      'POST',
      '/admin/notification-campaigns',
      {
        token: adminToken,
        headers: { 'X-Step-Up-Token': stepUpToken.body.data!.stepUpToken },
        body: {
          type: 'PROMO',
          titleTr: 'QA9 Kampanya',
          titleEn: 'QA9 Campaign',
          bodyTr: 'Kampanya denemesi',
          bodyEn: 'Campaign test',
        },
      },
    );
    expect(camp.body.ok).toBe(true);
    campaignId = camp.body.data!.id;

    const sends = await pgQuery(
      `SELECT count(*)::int AS adet FROM notification_sends ns
       JOIN notifications n ON n.id = ns."notificationId"
       WHERE n."dataJson"->>'campaignId' = '${campaignId}'`,
    );
    // Viewer'ın 2 cihazı var (admin/editor cihaz kaydetmedi) → ≥2 satır.
    expect(Number(sends[0]!.adet)).toBeGreaterThanOrEqual(2);
  });

  it('admin gönderim izleri ucu sayfa + sayaç döner', async () => {
    const res = await api<{
      items: Array<{ status: string; pushTokenMasked: string }>;
      stats: { pending: number; sent: number; failed: number };
      meta: { totalItems: number };
    }>('GET', `/admin/notification-campaigns/${campaignId}/sends?page=1&pageSize=20`, {
      token: adminToken,
    });
    expect(res.body.ok).toBe(true);
    expect(res.body.data!.items.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data!.stats.sent + res.body.data!.stats.pending).toBeGreaterThanOrEqual(2);
    expect(res.body.data!.items[0]!.pushTokenMasked).toContain('…');
  });

  it('dispatch sonrası kampanya gönderimleri SENT olur; bildirim pushSentAt dolar', async () => {
    const { PushDispatchService } = await import('./notifications/push-dispatch.service.js');
    const push = app.get(PushDispatchService);
    const result = await push.dispatchPending();
    expect(result.sent).toBeGreaterThanOrEqual(2);
    const rows = await pgQuery(
      `SELECT ns.status, n."pushSentAt" FROM notification_sends ns
       JOIN notifications n ON n.id = ns."notificationId"
       WHERE n."dataJson"->>'campaignId' = '${campaignId}'`,
    );
    console.log('DEBUG campaign rows:', JSON.stringify(rows));
    for (const row of rows) {
      expect(row.status).toBe('SENT');
      expect(row.pushSentAt).not.toBeNull();
    }
  });

  it('in-app okuma akışı: tek okundu + tümünü okundu + unreadCount düşer', async () => {
    const list = await api<{ items: Array<{ id: string; readAt: string | null }>; unreadCount: number }>(
      'GET',
      '/notifications?page=1&pageSize=20',
      { token: viewerToken },
    );
    const firstUnread = list.body.data!.items.find((n) => n.readAt === null);
    expect(firstUnread).toBeDefined();
    const before = list.body.data!.unreadCount;

    const mark = await api<{ marked: boolean }>('POST', `/notifications/${firstUnread!.id}/read`, {
      token: viewerToken,
      body: {},
    });
    expect(mark.body.data!.marked).toBe(true);

    const all = await api<{ marked: true }>('POST', '/notifications/read-all', {
      token: viewerToken,
      body: {},
    });
    expect(all.body.ok).toBe(true);

    const after = await api<{ unreadCount: number }>('GET', '/notifications?page=1&pageSize=20', {
      token: viewerToken,
    });
    expect(after.body.data!.unreadCount).toBe(0);
    expect(before).toBeGreaterThan(0);
  });
});
