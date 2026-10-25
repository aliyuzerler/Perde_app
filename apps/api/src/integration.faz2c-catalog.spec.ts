/**
 * Faz 2c ENTEGRASYON testleri — katalog gerçek-veri entegrasyonu (görev kapsamı).
 *
 * Doğrulanan senaryolar (görev brief'i):
 *   1. Boş katalog      → arşiv sonrası /home sections=[], /catalog/titles totalItems=0
 *   2. Çok sayıda yapım → 25 yeni yayın + sayfalama meta doğruluğu (4 sayfa)
 *   3. Arama sonuç yok  → items=[], meta.totalItems=0; filtreler (kind/category)
 *   4. Arşiv içerik     → herkese açık uçlarda 404/liste dışı; admin görünür
 *   5. Yetkisiz erişim  → 401 (watch-progress/watchlist), 403 (admin), 404 (taslak)
 *   6. İzleme geçmişi   → scope=continue/history ayrımı + sayfalama meta
 *   7. Ana sayfa düzeni → admin banner/home-section CRUD /home'a yansır
 *
 * Çalışma şartı: gömülü/yerel PostgreSQL. Değilse dürüstçe SKIP (sahte başarı yok).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { execSync, spawnSync } from 'node:child_process';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { RateLimiterService } from './auth/rate-limit.service.js';

const ADMIN_DB_URL = 'postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/postgres';
const TEST_DB = 'perdego_faz2c_test';
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
  console.warn('[integration-faz2c] PostgreSQL erişilemedi — entegrasyon testleri SKIP edilecek.');
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

/** Faz 3b: outbox dosyasından verilen e-postaya ait SON anahtarı okur. */
async function lastTokenFor(email: string): Promise<string> {
  const { readFileSync, existsSync } = await import('node:fs');
  const outboxPath = process.env.MAIL_OUTBOX_FILE!;
  if (!existsSync(outboxPath)) throw new Error(`outbox yok: ${outboxPath}`);
  const lines = readFileSync(outboxPath, 'utf8').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const record = JSON.parse(lines[i]!) as { to?: string; text?: string };
    if (record.to === email && record.text) {
      const match = record.text.match(/token=([A-Za-z0-9_-]+)/);
      if (match) return match[1]!;
    }
  }
  throw new Error(`anahtar bulunamadı: ${email}`);
}

/** Temiz kullanıcı (seed izleme geçmişi dışı) — deterministik sayaçlar için. */
async function registerVerified(
  displayName: string,
  email: string,
  password = 'Qa123456',
): Promise<string> {
  const reg = await api<{ tokens: { accessToken: string } }>('POST', '/auth/register', {
    body: { displayName, email, password },
  });
  expect(reg.status).toBe(201);
  const verify = await api<{ verified: boolean }>('POST', '/auth/verify-email', {
    body: { token: await lastTokenFor(email) },
  });
  expect(verify.status).toBe(201);
  return reg.body.data!.tokens.accessToken;
}

/** Admin akışı: taslak oluştur → yayınla (yaşam döngüsü uçlarıyla). */
async function createPublished(
  adminToken: string,
  index: number,
  accessType: 'FREE' | 'SUBSCRIPTION' | 'CREDIT' = 'FREE',
): Promise<{ id: string; slug: string }> {
  const slug = `test-yapim-${String(index).padStart(3, '0')}`;
  const created = await api<{ id: string }>('POST', '/admin/titles', {
    token: adminToken,
    body: {
      slug,
      kind: 'FILM',
      titleTr: `Test Yapım ${index}`,
      titleEn: `Test Title ${index}`,
      synopsisTr: `Test yapım ${index} özeti — arama ve sayfalama senaryoları için üretilmiştir.`,
      synopsisEn: `Test title ${index} synopsis for search and pagination scenarios.`,
      releaseYear: 2024,
      accessType,
    },
  });
  expect(created.status).toBe(201);
  const published = await api<{ status: string; publishedAt: string | null }>(
    'PATCH',
    `/admin/titles/${created.body.data!.id}/status`,
    { token: adminToken, body: { status: 'PUBLISHED' } },
  );
  expect(published.body.data!.status).toBe('PUBLISHED');
  return { id: created.body.data!.id, slug };
}

beforeAll(async () => {
  if (!dbAvailable) return;

  const admin = new Client({ connectionString: ADMIN_DB_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

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

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.MAIL_OUTBOX_FILE = `/tmp/perdego-mail-2c.jsonl`;
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

describe.skipIf(!dbAvailable)('Faz 2c — katalog entegrasyonu (gerçek PostgreSQL)', () => {
  let adminToken = '';
  let userToken = '';
  const createdSlugs: string[] = [];

  beforeEach(async () => {
    app?.get(RateLimiterService)?.reset?.();
  });

  beforeAll(async () => {
    if (!dbAvailable) return;
    adminToken = await login('admin@perdego.dev', 'Admin12345');
    userToken = await login('viewer@perdego.dev', 'Dev12345');
  });

  it('01 · taslak→işleniyor→yayında geçişleri çalışır; işleniyor herkese açık uçlarda görünmez', async () => {
    // Taslak oluştur
    const created = await api<{ id: string; slug: string }>('POST', '/admin/titles', {
      token: adminToken,
      body: {
        slug: 'isleniyor-testi',
        kind: 'FILM',
        titleTr: 'İşleniyor Testi',
        titleEn: 'Processing Test',
        synopsisTr: 'Medya transkod aşamasında bir yapım.',
        synopsisEn: 'A title in media transcoding stage.',
        releaseYear: 2025,
      },
    });
    expect(created.status).toBe(201);
    const contentId = created.body.data!.id;

    // Taslak → İŞLENİYOR
    const processing = await api<{ status: string; publishedAt: string | null }>(
      'PATCH',
      `/admin/titles/${contentId}/status`,
      { token: adminToken, body: { status: 'PROCESSING' } },
    );
    expect(processing.status).toBe(200);
    expect(processing.body.data!.status).toBe('PROCESSING');
    expect(processing.body.data!.publishedAt).toBeNull();

    // PROCESSING herkese açık uçlarda 404 / listede yok
    const publicDetail = await api('GET', '/catalog/titles/isleniyor-testi');
    expect(publicDetail.status).toBe(404);
    const publicList = await api<{ items: Array<{ slug: string }>; meta: { totalItems: number } }>(
      'GET',
      '/catalog/titles?pageSize=50',
    );
    expect(publicList.body.data!.items.some((i) => i.slug === 'isleniyor-testi')).toBe(false);

    // Admin yönetim listesi PROCESSING kaydını görür (görünürlük ayrımı)
    const adminList = await api<{ items: Array<{ slug: string; status: string }> }>(
      'GET',
      '/admin/titles?status=PROCESSING',
      { token: adminToken },
    );
    expect(adminList.status).toBe(200);
    expect(adminList.body.data!.items.map((i) => i.slug)).toContain('isleniyor-testi');

    // İŞLENİYOR → YAYINDA
    const published = await api<{ status: string; publishedAt: string | null }>(
      'PATCH',
      `/admin/titles/${contentId}/status`,
      {
        token: adminToken,
        body: { status: 'PUBLISHED' },
      },
    );
    expect(published.body.data!.status).toBe('PUBLISHED');
    expect(published.body.data!.publishedAt).not.toBeNull();
    const nowPublic = await api('GET', '/catalog/titles/isleniyor-testi');
    expect(nowPublic.status).toBe(200);

    // Geçersiz geçiş: PUBLISHED → PROCESSING reddedilir (400)
    const invalid = await api('PATCH', `/admin/titles/${contentId}/status`, {
      token: adminToken,
      body: { status: 'PROCESSING' },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error?.code).toBe('BAD_REQUEST');
  });

  it('02 · 25 yeni yapım + sayfalama: meta totalPages/hasNextPage doğru', async () => {
    for (let i = 1; i <= 25; i += 1) {
      const row = await createPublished(adminToken, i);
      createdSlugs.push(row.slug);
    }

    const page1 = await api<{
      items: Array<{ slug: string }>;
      meta: { page: number; totalItems: number; totalPages: number; hasNextPage: boolean };
    }>('GET', '/catalog/titles?pageSize=10&page=1');
    expect(page1.status).toBe(200);
    // 6 seed yayını + isleniyor-testi + 25 yeni = 32
    expect(page1.body.data!.meta.totalItems).toBe(32);
    expect(page1.body.data!.meta.totalPages).toBe(4);
    expect(page1.body.data!.meta.hasNextPage).toBe(true);
    expect(page1.body.data!.items).toHaveLength(10);

    const page2 = await api<{ items: Array<{ slug: string }>; meta: { page: number } }>(
      'GET',
      '/catalog/titles?pageSize=10&page=2',
    );
    const page1Slugs = page1.body.data!.items.map((i) => i.slug);
    const page2Slugs = page2.body.data!.items.map((i) => i.slug);
    expect(page2Slugs).toHaveLength(10);
    for (const slug of page2Slugs) expect(page1Slugs).not.toContain(slug);

    const page4 = await api<{ items: Array<{ slug: string }>; meta: { hasNextPage: boolean } }>(
      'GET',
      '/catalog/titles?pageSize=10&page=4',
    );
    expect(page4.body.data!.meta.hasNextPage).toBe(false);

    // Arama da aynı sayfalama meta'sını verir
    const searchMany = await api<{ meta: { totalItems: number; totalPages: number } }>(
      'GET',
      '/search?query=Test%20Yap%C4%B1m&pageSize=10',
    );
    expect(searchMany.body.data!.meta.totalItems).toBe(25);
    expect(searchMany.body.data!.meta.totalPages).toBe(3);
  });

  it('03 · arama filtreleri: kind ve category doğru daraltır', async () => {
    const films = await api<{ items: Array<{ kind: string }>; meta: { totalItems: number } }>(
      'GET',
      '/search?query=Test%20Yap%C4%B1m&kind=FILM&pageSize=50',
    );
    expect(films.body.data!.meta.totalItems).toBe(25);
    expect(films.body.data!.items.every((i) => i.kind === 'FILM')).toBe(true);

    const series = await api<{ meta: { totalItems: number } }>(
      'GET',
      '/search?query=Test%20Yap%C4%B1m&kind=SERIES&pageSize=50',
    );
    expect(series.body.data!.meta.totalItems).toBe(0);

    const dram = await api<{ items: Array<{ slug: string }> }>(
      'GET',
      '/search?query=Test%20Yap%C4%B1m&category=dram&pageSize=50',
    );
    expect(dram.body.data!.items).toHaveLength(0); // test yapımları dram kategorisinde değil
  });

  it('04 · arama sonucu yok: boş sayfalı yanıt (hata değil)', async () => {
    const miss = await api<{ items: unknown[]; meta: { totalItems: number; totalPages: number } }>(
      'GET',
      '/search?query=tamamen-olmayan-terim-zzz',
    );
    expect(miss.status).toBe(200);
    expect(miss.body.data!.items).toEqual([]);
    expect(miss.body.data!.meta.totalItems).toBe(0);
    expect(miss.body.data!.meta.totalPages).toBe(0);
  });

  it('05 · arşivlenmiş içerik: herkese açık uçlardan kaybolur, admin listesinde kalır', async () => {
    const target = createdSlugs[0]!;
    const detail = await api<{ id: string }>('GET', `/catalog/titles/${target}`);
    expect(detail.status).toBe(200);
    const contentId = detail.body.data!.id;

    const archived = await api<{ status: string }>('PATCH', `/admin/titles/${contentId}/status`, {
      token: adminToken,
      body: { status: 'ARCHIVED' },
    });
    expect(archived.status).toBe(200);
    expect(archived.body.data!.status).toBe('ARCHIVED');

    // Herkese açık uçlar: detay 404, listede yok, aramada yok
    expect((await api('GET', `/catalog/titles/${target}`)).status).toBe(404);
    const list = await api<{ items: Array<{ slug: string }>; meta: { totalItems: number } }>(
      'GET',
      '/catalog/titles?pageSize=50',
    );
    expect(list.body.data!.items.some((i) => i.slug === target)).toBe(false);
    expect(list.body.data!.meta.totalItems).toBe(31);
    const searchMiss = await api<{ meta: { totalItems: number } }>(
      'GET',
      `/search?query=${encodeURIComponent('Test Yapım')}&pageSize=50`,
    );
    expect(searchMiss.body.data!.meta.totalItems).toBe(24);

    // Admin: ARŞİVDE filtresi kaydı görmeye devam eder
    const adminArchived = await api<{ items: Array<{ slug: string; status: string }> }>(
      'GET',
      '/admin/titles?status=ARCHIVED',
      { token: adminToken },
    );
    expect(adminArchived.body.data!.items.map((i) => i.slug)).toContain(target);

    // Arşiv → yeniden yayın (ARCHIVED → PUBLISHED geçişi)
    const republish = await api<{ status: string }>('PATCH', `/admin/titles/${contentId}/status`, {
      token: adminToken,
      body: { status: 'PUBLISHED' },
    });
    expect(republish.body.data!.status).toBe('PUBLISHED');
    expect((await api('GET', `/catalog/titles/${target}`)).status).toBe(200);
  });

  it('06 · yetkisiz erişim: 401 (kimliksiz korumalı uçlar), 403 (rol yetersiz), 404 (taslak)', async () => {
    // 401: kimliksiz izleme geçmişi/favoriler
    const noTokenProgress = await api('GET', '/watch-progress');
    expect(noTokenProgress.status).toBe(401);
    const noTokenHistory = await api('GET', '/watch-progress?scope=history');
    expect(noTokenHistory.status).toBe(401);
    const noTokenFavorite = await api('POST', '/watchlist/some-content-id');
    expect(noTokenFavorite.status).toBe(401);

    // 403: USER rolü admin uçlarına erişemez
    const userAdminTitles = await api('GET', '/admin/titles', { token: userToken });
    expect(userAdminTitles.status).toBe(403);
    const userAdminStatus = await api('PATCH', '/admin/titles/whatever/status', {
      token: userToken,
      body: { status: 'PUBLISHED' },
    });
    expect(userAdminStatus.status).toBe(403);
    const userAdminBanner = await api('POST', '/admin/banners', {
      token: userToken,
      body: { slug: 'hack-banner', titleTr: 'x', titleEn: 'x', imageUrl: '/x.svg' },
    });
    expect(userAdminBanner.status).toBe(403);

    // 404: taslak slug herkese açık detayda
    expect((await api('GET', '/catalog/titles/yeni-baslangic')).status).toBe(404);
  });

  it('07 · izleme geçmişi kapsamı: continue tamamlanmamışları, history tümünü verir (sayfalı)', async () => {
    // Temiz kullanıcı: seed izleme geçmişi sayaçları bozmasın (deterministik).
    const freshToken = await registerVerified('Faz2c İzleyici', 'faz2c-watcher@perdego.dev');

    // Gizli Bahçe: tüm sezonlardaki bölümler (season 1: 2 bölüm + season 2: 1+ bölüm).
    const detail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string }> }> }>(
      'GET',
      '/catalog/titles/gizli-bahce',
    );
    const episodes = detail.body.data!.accessSeasons.flatMap((season) => season.episodes);
    expect(episodes.length).toBeGreaterThanOrEqual(3);

    await api('PUT', `/watch-progress/${episodes[0]!.id}`, {
      token: freshToken,
      body: { positionSeconds: 60 },
    });
    await api('PUT', `/watch-progress/${episodes[1]!.id}`, {
      token: freshToken,
      body: { positionSeconds: 30 },
    });
    // Üçüncü bölüm %90 üstü → tamamlanmış
    await api('PUT', `/watch-progress/${episodes[2]!.id}`, {
      token: freshToken,
      body: { positionSeconds: 9999 },
    });

    const cont = await api<{ items: Array<{ episodeId: string; completed: boolean }>; meta?: unknown }>(
      'GET',
      '/watch-progress',
      { token: freshToken },
    );
    expect(cont.status).toBe(200);
    expect(cont.body.data!.items).toHaveLength(2);
    expect(cont.body.data!.items.every((i) => !i.completed)).toBe(true);
    expect(cont.body.data!.meta).toBeUndefined();

    const history = await api<{
      items: Array<{ episodeId: string; completed: boolean }>;
      meta: { totalItems: number; totalPages: number };
    }>('GET', '/watch-progress?scope=history', { token: freshToken });
    expect(history.status).toBe(200);
    expect(history.body.data!.items).toHaveLength(3);
    expect(history.body.data!.meta.totalItems).toBe(3);
    expect(history.body.data!.meta.totalPages).toBe(1);

    const historyPaged = await api<{ items: unknown[]; meta: { totalPages: number; hasNextPage: boolean } }>(
      'GET',
      '/watch-progress?scope=history&pageSize=2',
      { token: freshToken },
    );
    expect(historyPaged.body.data!.items).toHaveLength(2);
    expect(historyPaged.body.data!.meta.totalPages).toBe(2);
    expect(historyPaged.body.data!.meta.hasNextPage).toBe(true);
  });

  it('08 · favoriler uçtan uca: ekle → liste → çıkar (idempotent, temiz kullanıcıyla)', async () => {
    const freshToken = await registerVerified('Faz2c Favorici', 'faz2c-favoriter@perdego.dev');
    const detail = await api<{ id: string }>('GET', '/catalog/titles/gece-yarisi-treni');
    const contentId = detail.body.data!.id;

    const add = await api<{ favorited: boolean; alreadyFavorited: boolean }>(
      'POST',
      `/watchlist/${contentId}`,
      { token: freshToken },
    );
    expect(add.status).toBe(201);
    expect(add.body.data!.favorited).toBe(true);

    const list = await api<{ items: Array<{ contentId: string }> }>('GET', '/watchlist', {
      token: freshToken,
    });
    expect(list.body.data!.items.map((i) => i.contentId)).toContain(contentId);

    const remove = await api<{ favorited: boolean }>('DELETE', `/watchlist/${contentId}`, {
      token: freshToken,
    });
    expect(remove.body.data!.favorited).toBe(false);
    const emptyList = await api<{ items: Array<{ contentId: string }> }>('GET', '/watchlist', {
      token: freshToken,
    });
    expect(emptyList.body.data!.items).toHaveLength(0);
  });

  it('09 · banner yönetimi: oluşturma /home\u2019a yansır, pasife alma gizler, silme kaldırır', async () => {
    const create = await api<{ id: string }>('POST', '/admin/banners', {
      token: adminToken,
      body: {
        slug: 'faz2c-test-banner',
        titleTr: 'Faz2c Banner',
        titleEn: 'Faz2c Banner',
        imageUrl: '/placeholders/banner/gece-yarisi-treni.svg',
      },
    });
    expect(create.status).toBe(201);
    const bannerId = create.body.data!.id;

    const adminBanners = await api<{ items: Array<{ slug: string }> }>('GET', '/admin/banners', {
      token: adminToken,
    });
    expect(adminBanners.body.data!.items.map((b) => b.slug)).toContain('faz2c-test-banner');

    const home1 = await api<{ banners: Array<{ title: string }> }>('GET', '/home');
    expect(home1.body.data!.banners.map((b) => b.title)).toContain('Faz2c Banner');

    await api('PATCH', `/admin/banners/${bannerId}`, {
      token: adminToken,
      body: { isActive: false },
    });
    const home2 = await api<{ banners: Array<{ title: string }> }>('GET', '/home');
    expect(home2.body.data!.banners.map((b) => b.title)).not.toContain('Faz2c Banner');

    const removed = await api('DELETE', `/admin/banners/${bannerId}`, { token: adminToken });
    expect(removed.status).toBe(200);
    const adminBanners2 = await api<{ items: Array<{ slug: string }> }>('GET', '/admin/banners', {
      token: adminToken,
    });
    expect(adminBanners2.body.data!.items.map((b) => b.slug)).not.toContain('faz2c-test-banner');
  });

  it('10 · ana sayfa bölüm yönetimi: RAIL oluştur + item ekle → /home\u2019da görünür; silinince kaybolur', async () => {
    const section = await api<{ id: string }>('POST', '/admin/home-sections', {
      token: adminToken,
      body: {
        key: 'faz2c-ray',
        sectionType: 'RAIL',
        titleTr: 'Faz2c Rayı',
        titleEn: 'Faz2c Rail',
        contentLimit: 5,
      },
    });
    expect(section.status).toBe(201);
    const sectionId = section.body.data!.id;

    const detail = await api<{ id: string }>('GET', '/catalog/titles/gece-yarisi-treni');
    const contentId = detail.body.data!.id;

    const addItem = await api('POST', `/admin/home-sections/${sectionId}/items`, {
      token: adminToken,
      body: { contentId },
    });
    expect(addItem.status).toBe(201);

    // Çift ekleme 409
    const duplicate = await api('POST', `/admin/home-sections/${sectionId}/items`, {
      token: adminToken,
      body: { contentId },
    });
    expect(duplicate.status).toBe(409);

    const home = await api<{ sections: Array<{ title: string; items: Array<{ slug: string }> }> }>(
      'GET',
      '/home',
    );
    const rail = home.body.data!.sections.find((s) => s.title === 'Faz2c Rayı');
    expect(rail).toBeDefined();
    expect(rail!.items.map((i) => i.slug)).toContain('gece-yarisi-treni');

    // Admin liste görünümü items'ı içerir
    const adminSections = await api<{ items: Array<{ key: string; items: Array<{ slug: string }> }> }>(
      'GET',
      '/admin/home-sections',
      { token: adminToken },
    );
    const adminRail = adminSections.body.data!.items.find((s) => s.key === 'faz2c-ray');
    expect(adminRail!.items.some((i) => i.slug === 'gece-yarisi-treni')).toBe(true);

    const deleted = await api('DELETE', `/admin/home-sections/${sectionId}`, { token: adminToken });
    expect(deleted.status).toBe(200);
    const homeAfter = await api<{ sections: Array<{ title: string }> }>('GET', '/home');
    expect(homeAfter.body.data!.sections.some((s) => s.title === 'Faz2c Rayı')).toBe(false);
  });

  it('11 · BOŞ KATALOG: tüm yayınlar arşivlenince home/titles/arama boşalır, admin görünür kalır', async () => {
    // Yayındaki tüm içerikleri arşivle (geçiş matrisi: PUBLISHED → ARCHIVED)
    const published = await api<{ items: Array<{ contentId: string; status: string }> }>(
      'GET',
      '/admin/titles?status=PUBLISHED&pageSize=50',
      { token: adminToken },
    );
    expect(published.body.data!.items.length).toBeGreaterThanOrEqual(32);
    for (const row of published.body.data!.items) {
      const archived = await api('PATCH', `/admin/titles/${row.contentId}/status`, {
        token: adminToken,
        body: { status: 'ARCHIVED' },
      });
      expect(archived.status).toBe(200);
    }

    const titles = await api<{ items: unknown[]; meta: { totalItems: number } }>(
      'GET',
      '/catalog/titles?pageSize=50',
    );
    expect(titles.body.data!.items).toEqual([]);
    expect(titles.body.data!.meta.totalItems).toBe(0);

    const home = await api<{ banners: unknown[]; sections: unknown[] }>('GET', '/home');
    expect(home.status).toBe(200);
    expect(home.body.data!.sections).toEqual([]);

    const search = await api<{ items: unknown[]; meta: { totalItems: number } }>(
      'GET',
      '/search?query=Yap%C4%B1m',
    );
    expect(search.body.data!.items).toEqual([]);

    // Arşivlenmiş detay artık 404
    expect((await api('GET', `/catalog/titles/${createdSlugs[1]}`)).status).toBe(404);

    // Admin görünümü tüm arşiv kayıtlarını hâlâ görür (kullanıcı/admin ayrımı)
    const adminAll = await api<{ meta: { totalItems: number } }>(
      'GET',
      '/admin/titles?status=ARCHIVED&pageSize=50',
      { token: adminToken },
    );
    expect(adminAll.body.data!.meta.totalItems).toBeGreaterThanOrEqual(32);
  });
});
