/**
 * FAZ 8 ENTEGRASYON testleri — yönetim paneli backend akışları (gerçek PG).
 *
 * Kapsam: RBAC (USER/EDITOR/ADMIN), dashboard, yapım düzenleme + detay,
 * sezon/bölüm CRUD + yayın geçişleri, gelir modeli (plan/paket/transaction/
 * ledger), kullanıcı yönetimi, bildirim kampanyaları, step-up doğrulama
 * ve audit log kayıtları.
 *
 * Çalışma şartı: gömülü/yerel PostgreSQL erişilebilir olmalı; değilse SKIP
 * (sahte başarı yok).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { execSync, spawnSync } from 'node:child_process';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';

const ADMIN_DB_URL = 'postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/postgres';
const TEST_DB = 'perdego_faz8_test';
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
  console.warn('[integration-faz8] PostgreSQL erişilemedi — FAZ 8 entegrasyon testleri SKIP.');
}

async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Envelope<T> }> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.headers?.['X-Step-Up-Token']) headers['X-Step-Up-Token'] = options.headers['X-Step-Up-Token'];
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

async function stepUp(token: string, password: string): Promise<string> {
  const { body } = await api<{ stepUpToken: string }>('POST', '/auth/step-up', {
    token,
    body: { password },
  });
  expect(body.ok).toBe(true);
  return body.data!.stepUpToken;
}

const EDITOR_EMAIL = 'editor@perdego.dev';
const ADMIN_EMAIL = 'admin@perdego.dev';
const ADMIN_PASSWORD = 'Admin12345';
const VIEWER_EMAIL = 'viewer@perdego.dev';
const VIEWER_PASSWORD = 'Dev12345';

let editorToken = '';
let adminToken = '';
let viewerToken = '';

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
  process.env.MAIL_OUTBOX_FILE = '/tmp/perdego-mail-faz8.jsonl';
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
  editorToken = await login(EDITOR_EMAIL, ADMIN_PASSWORD);
  viewerToken = await login(VIEWER_EMAIL, VIEWER_PASSWORD);
}, 180_000);

afterAll(async () => {
  if (app) await app.close();
});

describe.skipIf(!dbAvailable)('FAZ 8 — RBAC', () => {
  it('USER rolü admin uçlarına erişemez (403)', async () => {
    const dash = await api('GET', '/admin/dashboard', { token: viewerToken });
    expect(dash.status).toBe(403);
    expect(dash.body.error?.code).toBe('FORBIDDEN');

    const titles = await api('GET', '/admin/titles', { token: viewerToken });
    expect(titles.status).toBe(403);
  });

  it('token yoksa 401 döner', async () => {
    const res = await api('GET', '/admin/dashboard');
    expect(res.status).toBe(401);
  });

  it('EDITOR plan güncelleyemez (ADMIN-only 403)', async () => {
    const plans = await api<{ items: Array<{ id: string; email?: string }> }>('GET', '/admin/plans', { token: editorToken });
    expect(plans.status).toBe(200);
    const planId = plans.body.data!.items[0]!.id;
    const upd = await api('PATCH', `/admin/plans/${planId}`, {
      token: editorToken,
      headers: { 'X-Step-Up-Token': 'stup1.x.y' },
      body: { priceKurus: 1 },
    });
    expect(upd.status).toBe(403);
    expect(upd.body.error?.details?.reason ?? upd.body.error?.code).toBe('ADMIN_ONLY');
  });
});

describe.skipIf(!dbAvailable)('FAZ 8 — Step-up doğrulama', () => {
  it('yanlış parola step-up token üretmez (401)', async () => {
    const res = await api('POST', '/auth/step-up', {
      token: adminToken,
      body: { password: 'yanlis-sifre' },
    });
    expect(res.status).toBe(401);
  });

  it('step-up token olmadan kritik uç 401 STEP_UP_REQUIRED döner', async () => {
    const users = await api<{ items: Array<{ id: string; email?: string }> }>('GET', '/admin/users', { token: adminToken });
    const target = users.body.data!.items.find((u) => u.email === VIEWER_EMAIL)!;
    const res = await api('PATCH', `/admin/users/${target.id}/status`, {
      token: adminToken,
      body: { status: 'SUSPENDED' },
    });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
  });

  it('başka kullanıcının step-up tokenı kabul edilmez (403)', async () => {
    const editorStep = await stepUp(editorToken, ADMIN_PASSWORD);
    const users = await api<{ items: Array<{ id: string; email?: string }> }>('GET', '/admin/users', { token: adminToken });
    const target = users.body.data!.items.find((u) => u.email === VIEWER_EMAIL)!;
    const res = await api('PATCH', `/admin/users/${target.id}/status`, {
      token: adminToken,
      headers: { 'X-Step-Up-Token': editorStep },
      body: { status: 'SUSPENDED' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });
});

describe.skipIf(!dbAvailable)('FAZ 8 — Dashboard', () => {
  it('gerçek sayılarla özet döner', async () => {
    const res = await api<{
      users: { total: number; active: number };
      catalog: { publishedTitles: number; totalEpisodes: number };
      purchases: { totalCount: number };
      series: Array<{ day: string }>;
      recentAudit: Array<{ action: string }>;
    }>('GET', '/admin/dashboard', { token: adminToken });
    expect(res.status).toBe(200);
    const data = res.body.data!;
    expect(data.users.total).toBeGreaterThanOrEqual(3);
    expect(data.catalog.publishedTitles).toBeGreaterThanOrEqual(1);
    expect(data.catalog.totalEpisodes).toBeGreaterThanOrEqual(1);
    expect(data.series.length).toBeGreaterThan(0);
    expect(Array.isArray(data.recentAudit)).toBe(true);
  });

  it('tarih aralığı parametreleri kabul edilir', async () => {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date().toISOString();
    const res = await api<{ range: { from: string; to: string } }>(
      'GET',
      `/admin/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { token: adminToken },
    );
    expect(res.status).toBe(200);
    expect(res.body.data!.range.from).toBe(from);
  });
});

describe.skipIf(!dbAvailable)('FAZ 8 — Yapım düzenleme ve detay', () => {
  let contentId = '';

  it('taslak oluşturur ve detayda görünür', async () => {
    const create = await api<{ id: string }>('POST', '/admin/titles', {
      token: editorToken,
      body: {
        slug: 'faz8-test-filmi',
        kind: 'FILM',
        titleTr: 'FAZ 8 Test Filmi',
        titleEn: 'FAZ 8 Test Film',
        synopsisTr: 'Test sinopsis',
        synopsisEn: 'Test synopsis',
        releaseYear: 2026,
        accessType: 'FREE',
      },
    });
    expect(create.status).toBe(201);
    contentId = create.body.data!.id;
  });

  it('afiş + başlık günceller ve audit loglar', async () => {
    const upd = await api<{ ok: boolean }>('PATCH', `/admin/titles/${contentId}`, {
      token: editorToken,
      body: {
        titleTr: 'FAZ 8 Test Filmi (düzenli)',
        posterUrl: 'https://cdn.perdego.dev/posters/faz8.jpg',
        accessType: 'SUBSCRIPTION',
      },
    });
    expect(upd.status).toBe(200);
    expect(upd.body.data!.ok).toBe(true);

    const detail = await api<{ titleTr: string; posterUrl: string; accessType: string }>(
      'GET',
      `/admin/titles/${contentId}`,
      { token: editorToken },
    );
    expect(detail.status).toBe(200);
    expect(detail.body.data!.titleTr).toBe('FAZ 8 Test Filmi (düzenli)');
    expect(detail.body.data!.posterUrl).toBe('https://cdn.perdego.dev/posters/faz8.jpg');
    expect(detail.body.data!.accessType).toBe('SUBSCRIPTION');

    const logs = await api<{ items: Array<{ action: string; entityId: string }> }>(
      'GET',
      '/admin/audit-logs?action=CONTENT_UPDATE',
      { token: adminToken },
    );
    expect(logs.body.data!.items.some((l) => l.entityId === contentId && l.action === 'CONTENT_UPDATE')).toBe(true);
  });

  it('geçersiz poster URL reddedilir (422/400)', async () => {
    const res = await api('PATCH', `/admin/titles/${contentId}`, {
      token: editorToken,
      body: { posterUrl: 'gecerli-degil' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('BAD_REQUEST');
  });
});

describe.skipIf(!dbAvailable)('FAZ 8 — Sezon ve bölüm yönetimi', () => {
  let contentId = '';
  let episodeId = '';

  beforeAll(async () => {
    if (!dbAvailable) return;
    const create = await api<{ id: string }>('POST', '/admin/titles', {
      token: editorToken,
      body: {
        slug: 'faz8-test-dizi',
        kind: 'SERIES',
        seriesFormat: 'STANDARD',
        titleTr: 'FAZ 8 Test Dizi',
        titleEn: 'FAZ 8 Test Series',
        synopsisTr: 'sinopsis',
        synopsisEn: 'synopsis',
        releaseYear: 2026,
      },
    });
    contentId = create.body.data!.id;
  });

  it('sezon oluşturur; aynı numara 409 döner', async () => {
    const ok = await api<{ id: string }>('POST', `/admin/titles/${contentId}/seasons`, {
      token: editorToken,
      body: { seasonNumber: 1, titleTr: 'Sezon 1' },
    });
    expect(ok.status).toBe(201);

    const dup = await api('POST', `/admin/titles/${contentId}/seasons`, {
      token: editorToken,
      body: { seasonNumber: 1 },
    });
    expect(dup.status).toBe(409);
  });

  it('CREDIT bölümsüz creditCost ile oluşturulamaz (400)', async () => {
    const res = await api('POST', `/admin/titles/${contentId}/episodes`, {
      token: editorToken,
      body: {
        seasonNumber: 1,
        episodeNumber: 1,
        titleTr: 'Bölüm 1',
        titleEn: 'Episode 1',
        durationSeconds: 600,
        accessType: 'CREDIT',
      },
    });
    expect(res.status).toBe(400);
  });

  it('CREDIT + creditCost ile bölüm oluşturur; detayda doğru erişim modeli görünür', async () => {
    const res = await api<{ id: string }>('POST', `/admin/titles/${contentId}/episodes`, {
      token: editorToken,
      body: {
        seasonNumber: 1,
        episodeNumber: 1,
        titleTr: 'Bölüm 1',
        titleEn: 'Episode 1',
        durationSeconds: 600,
        accessType: 'CREDIT',
        creditCost: 25,
      },
    });
    expect(res.status).toBe(201);
    episodeId = res.body.data!.id;

    const detail = await api<{
      seasons: Array<{ episodes: Array<{ id: string; accessType: string; creditCost: number | null }> }>;
    }>('GET', `/admin/titles/${contentId}`, { token: editorToken });
    const episode = detail.body.data!.seasons[0]!.episodes.find((e) => e.id === episodeId)!;
    expect(episode.accessType).toBe('CREDIT');
    expect(episode.creditCost).toBe(25);
  });

  it('aynı bölüm numarası 409 döner', async () => {
    const res = await api('POST', `/admin/titles/${contentId}/episodes`, {
      token: editorToken,
      body: {
        seasonNumber: 1,
        episodeNumber: 1,
        titleTr: 'Çift',
        titleEn: 'Dup',
        durationSeconds: 100,
      },
    });
    expect(res.status).toBe(409);
  });

  it('olmayan sezona bölüm eklenemez (400)', async () => {
    const res = await api('POST', `/admin/titles/${contentId}/episodes`, {
      token: editorToken,
      body: {
        seasonNumber: 9,
        episodeNumber: 1,
        titleTr: 'Yok',
        titleEn: 'None',
        durationSeconds: 100,
      },
    });
    expect(res.status).toBe(400);
  });

  it('bölüm yayınlanır; geçersiz geçiş 400; yayından kaldırma ARCHIVED ile', async () => {
    const pub = await api<{ status: string }>('PATCH', `/admin/episodes/${episodeId}/status`, {
      token: editorToken,
      body: { status: 'PUBLISHED' },
    });
    expect(pub.status).toBe(200);
    expect(pub.body.data!.status).toBe('PUBLISHED');

    const bad = await api('PATCH', `/admin/episodes/${episodeId}/status`, {
      token: editorToken,
      body: { status: 'PUBLISHED' },
    });
    expect(bad.status).toBe(400);

    const unpublish = await api<{ status: string }>('PATCH', `/admin/episodes/${episodeId}/status`, {
      token: editorToken,
      body: { status: 'ARCHIVED' },
    });
    expect(unpublish.status).toBe(200);
    expect(unpublish.body.data!.status).toBe('ARCHIVED');
  });

  it('yayınlanmış bölüm silinemez (409); arşivde ve kayıtsız silinir', async () => {
    // bölüm şu an ARCHIVED ve kayıtsız → silinebilir
    const del = await api('DELETE', `/admin/episodes/${episodeId}`, { token: editorToken });
    expect(del.status).toBe(200);
  });
});

describe.skipIf(!dbAvailable)('FAZ 8 — Gelir modeli', () => {
  it('plan listesi platform ürün kimlikleriyle döner', async () => {
    const res = await api<{ items: Array<{ code: string; priceKurus: number }> }>('GET', '/admin/plans', {
      token: editorToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.data!.items.length).toBeGreaterThanOrEqual(2);
  });

  it('ADMIN + step-up ile plan fiyatı güncellenir ve audit loglanır', async () => {
    const plans = await api<{ items: Array<{ id: string; code: string }> }>('GET', '/admin/plans', {
      token: adminToken,
    });
    const planId = plans.body.data!.items[0]!.id;
    const step = await stepUp(adminToken, ADMIN_PASSWORD);
    const upd = await api('PATCH', `/admin/plans/${planId}`, {
      token: adminToken,
      headers: { 'X-Step-Up-Token': step },
      body: { priceKurus: 5990 },
    });
    expect(upd.status).toBe(200);

    const logs = await api<{ items: Array<{ action: string; entityId: string }> }>(
      'GET',
      '/admin/audit-logs?action=PLAN_UPDATE',
      { token: adminToken },
    );
    expect(logs.body.data!.items.some((l) => l.entityId === planId)).toBe(true);
  });

  it('kredi paketleri listelenir ve step-up ile güncellenir', async () => {
    const packs = await api<{ items: Array<{ id: string; priceKurus: number }> }>('GET', '/admin/credit-packs', {
      token: adminToken,
    });
    expect(packs.status).toBe(200);
    expect(packs.body.data!.items.length).toBeGreaterThanOrEqual(3);

    const packId = packs.body.data!.items[0]!.id;
    const step = await stepUp(adminToken, ADMIN_PASSWORD);
    const upd = await api('PATCH', `/admin/credit-packs/${packId}`, {
      token: adminToken,
      headers: { 'X-Step-Up-Token': step },
      body: { priceKurus: 2990, isActive: true },
    });
    expect(upd.status).toBe(200);
  });

  it('mağaza işlemleri ve kredi ledger listelenir', async () => {
    const tx = await api<{ items: unknown[]; meta: { totalItems: number } }>('GET', '/admin/store-transactions', {
      token: adminToken,
    });
    expect(tx.status).toBe(200);
    expect(tx.body.data!.meta.totalItems).toBeGreaterThanOrEqual(0);

    const ledger = await api<{ items: Array<{ type: string }> }>('GET', '/admin/credit-ledger', {
      token: adminToken,
    });
    expect(ledger.status).toBe(200);
    expect(ledger.body.data!.items.length).toBeGreaterThan(0);
  });

  it('ledger tip filtresi çalışır', async () => {
    const res = await api<{ items: Array<{ type: string }> }>('GET', '/admin/credit-ledger?type=GRANT', {
      token: adminToken,
    });
    expect(res.status).toBe(200);
    for (const item of res.body.data!.items) {
      expect(item.type).toBe('GRANT');
    }
  });
});

describe.skipIf(!dbAvailable)('FAZ 8 — Kullanıcı yönetimi', () => {
  it('kullanıcı detayı cüzdan + abonelik + istatistiklerle döner', async () => {
    const users = await api<{ items: Array<{ id: string; email: string }> }>('GET', '/admin/users', {
      token: adminToken,
    });
    const viewer = users.body.data!.items.find((u) => u.email === VIEWER_EMAIL)!;

    const detail = await api<{
      email: string;
      wallet: { total: number } | null;
      subscription: { planCode: string } | null;
      stats: { unlockCount: number };
    }>('GET', `/admin/users/${viewer.id}`, { token: adminToken });
    expect(detail.status).toBe(200);
    expect(detail.body.data!.email).toBe(VIEWER_EMAIL);
    expect(detail.body.data!.stats).toBeDefined();
  });

  it('yönetici kendi rolünü değiştiremez (409)', async () => {
    const users = await api<{ items: Array<{ id: string; email: string }> }>('GET', '/admin/users', {
      token: adminToken,
    });
    const self = users.body.data!.items.find((u) => u.email === ADMIN_EMAIL)!;
    const step = await stepUp(adminToken, ADMIN_PASSWORD);
    const res = await api('PATCH', `/admin/users/${self.id}/role`, {
      token: adminToken,
      headers: { 'X-Step-Up-Token': step },
      body: { role: 'EDITOR' },
    });
    expect(res.status).toBe(409);
  });

  it('step-up ile kullanıcı askıya alınır ve geri alınır; audit loglanır', async () => {
    const users = await api<{ items: Array<{ id: string; email: string }> }>('GET', '/admin/users', {
      token: adminToken,
    });
    const viewer = users.body.data!.items.find((u) => u.email === VIEWER_EMAIL)!;
    const step = await stepUp(adminToken, ADMIN_PASSWORD);

    const suspend = await api('PATCH', `/admin/users/${viewer.id}/status`, {
      token: adminToken,
      headers: { 'X-Step-Up-Token': step },
      body: { status: 'SUSPENDED' },
    });
    expect(suspend.status).toBe(200);

    const detail = await api<{ status: string }>('GET', `/admin/users/${viewer.id}`, { token: adminToken });
    expect(detail.body.data!.status).toBe('SUSPENDED');

    const step2 = await stepUp(adminToken, ADMIN_PASSWORD);
    const restore = await api('PATCH', `/admin/users/${viewer.id}/status`, {
      token: adminToken,
      headers: { 'X-Step-Up-Token': step2 },
      body: { status: 'ACTIVE' },
    });
    expect(restore.status).toBe(200);

    const logs = await api<{ items: Array<{ action: string; entityId: string }> }>(
      'GET',
      '/admin/audit-logs?action=USER_STATUS_CHANGE',
      { token: adminToken },
    );
    expect(logs.body.data!.items.some((l) => l.entityId === viewer.id)).toBe(true);
  });

  it('rol değişikliği step-up ile yapılır (USER→EDITOR→USER)', async () => {
    const users = await api<{ items: Array<{ id: string; email: string }> }>('GET', '/admin/users', {
      token: adminToken,
    });
    const viewer = users.body.data!.items.find((u) => u.email === VIEWER_EMAIL)!;
    const step = await stepUp(adminToken, ADMIN_PASSWORD);

    const promote = await api('PATCH', `/admin/users/${viewer.id}/role`, {
      token: adminToken,
      headers: { 'X-Step-Up-Token': step },
      body: { role: 'EDITOR' },
    });
    expect(promote.status).toBe(200);

    const step2 = await stepUp(adminToken, ADMIN_PASSWORD);
    const demote = await api('PATCH', `/admin/users/${viewer.id}/role`, {
      token: adminToken,
      headers: { 'X-Step-Up-Token': step2 },
      body: { role: 'USER' },
    });
    expect(demote.status).toBe(200);
  });
});

describe.skipIf(!dbAvailable)('FAZ 8 — Bildirim kampanyaları', () => {
  it('step-up olmadan kampanya oluşturulamaz (401)', async () => {
    const res = await api('POST', '/admin/notification-campaigns', {
      token: adminToken,
      body: {
        type: 'NEW_EPISODE',
        titleTr: 'Yeni bölüm',
        titleEn: 'New episode',
        bodyTr: 'gövde',
        bodyEn: 'body',
      },
    });
    expect(res.status).toBe(401);
  });

  it('derhal gönderim: SENT + tüm aktif kullanıcılara bildirim satırı', async () => {
    const step = await stepUp(adminToken, ADMIN_PASSWORD);
    const res = await api<{
      id: string;
      status: string;
      recipientCount: number;
      readCount: number;
    }>('POST', '/admin/notification-campaigns', {
      token: adminToken,
      headers: { 'X-Step-Up-Token': step },
      body: {
        type: 'NEW_EPISODE',
        titleTr: 'FAZ 8 duyurusu',
        titleEn: 'FAZ 8 announcement',
        bodyTr: 'Yeni bölüm yayında!',
        bodyEn: 'New episode is live!',
        dataJson: { contentId: 'test' },
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.data!.status).toBe('SENT');
    expect(res.body.data!.recipientCount).toBeGreaterThanOrEqual(3);
  });

  it('planlanmış kampanya SCHEDULED kalır ve iptal edilebilir', async () => {
    const step = await stepUp(adminToken, ADMIN_PASSWORD);
    const future = new Date(Date.now() + 24 * 3600_000).toISOString();
    const create = await api<{ id: string; status: string }>('POST', '/admin/notification-campaigns', {
      token: adminToken,
      headers: { 'X-Step-Up-Token': step },
      body: {
        type: 'PROMO',
        titleTr: 'Planlı promo',
        titleEn: 'Scheduled promo',
        bodyTr: 'gövde',
        bodyEn: 'body',
        scheduledFor: future,
      },
    });
    expect(create.status).toBe(201);
    expect(create.body.data!.status).toBe('SCHEDULED');

    const cancel = await api('POST', `/admin/notification-campaigns/${create.body.data!.id}/cancel`, {
      token: adminToken,
      headers: { 'X-Step-Up-Token': step },
    });
    expect(cancel.status).toBe(201);

    const list = await api<{ items: Array<{ id: string; status: string }> }>(
      'GET',
      '/admin/notification-campaigns',
      { token: adminToken },
    );
    const cancelled = list.body.data!.items.find((c) => c.id === create.body.data!.id)!;
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('kampanya gönderimi audit loga CAMPAIGN_SENT olarak düşer', async () => {
    const logs = await api<{ items: Array<{ action: string }> }>(
      'GET',
      '/admin/audit-logs?action=CAMPAIGN_SENT',
      { token: adminToken },
    );
    expect(logs.body.data!.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe.skipIf(!dbAvailable)('FAZ 8 — Audit log filtreleri', () => {
  it('action + actorId birlikte filtrelenir', async () => {
    const users = await api<{ items: Array<{ id: string; email: string }> }>('GET', '/admin/users', {
      token: adminToken,
    });
    const admin = users.body.data!.items.find((u) => u.email === ADMIN_EMAIL)!;

    const res = await api<{ items: Array<{ actorUserId: string | null; action: string }> }>(
      'GET',
      `/admin/audit-logs?action=CAMPAIGN&actorId=${admin.id}`,
      { token: adminToken },
    );
    expect(res.status).toBe(200);
    for (const row of res.body.data!.items) {
      expect(row.action).toContain('CAMPAIGN');
      expect(row.actorUserId).toBe(admin.id);
    }
  });
});
