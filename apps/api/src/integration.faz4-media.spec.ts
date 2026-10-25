/**
 * FAZ 4 ENTEGRASYON testleri — medya sağlayıcı ve oynatma altyapısı
 * (gerçek PostgreSQL üzerinde uçtan uca akış).
 *
 * Kapsam:
 *  - Oynatma oturumu: imzalı kaynaklar, altyazı listesi, konuk/üye ayrımı
 *  - İmzalı dosya servisi: manifest → segment → altyazı → mp4 (Range dahil)
 *  - İmza/süre ihlalleri: bozuk token, geçmiş exp → 403
 *  - Erişim kararı: FREE konuk açılır, SUBSCRIPTION/CREDIT 402, DRAFT 404
 *  - Doğrudan yükleme akışı: upload-url → PUT ham dosya → PROCESSING →
 *    sync READY → tek-READY kısıtında eski sürüm düşürülür → mp4 oynatımı
 *  - Yükleme anahtarı ihlalleri: bozuk token, ikinci yükleme → 403/409
 *
 * Çalışma şartı: gömülü/yerel PostgreSQL erişilebilir olmalı; değilse süreç
 * dürüstçe SKIP edilir (sahte başarı yok).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { RateLimiterService } from './auth/rate-limit.service.js';

const ADMIN_DB_URL = 'postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/postgres';
const TEST_DB = 'perdego_faz4_test';
const TEST_DB_URL = `postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/${TEST_DB}`;

/** Örnek paket yerinde mi (scripts/generate-sample-media.sh çıktısı)? */
const SAMPLE_MASTER = path.resolve(process.cwd(), 'media-storage/samples/a/master.m3u8');
let samplesAvailable = false;
try {
  samplesAvailable = readFileSync(SAMPLE_MASTER, 'utf8').includes('#EXTM3U');
} catch {
  samplesAvailable = false;
}

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
  console.warn('[integration] PostgreSQL erişilemedi — FAZ 4 entegrasyon testleri SKIP edilecek.');
}

async function api<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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

/** Doğrulanmış kayıt (Faz 3b politikası) — outbox'tan anahtar okur. */
async function registerVerified(
  displayName: string,
  email: string,
  password = 'Qa123456',
): Promise<{ accessToken: string }> {
  const reg = await api<{ tokens: { accessToken: string } }>('POST', '/auth/register', {
    body: { displayName, email, password },
  });
  expect(reg.status).toBe(201);
  const outboxPath = process.env.MAIL_OUTBOX_FILE!;
  const lines = readFileSync(outboxPath, 'utf8').trim().split('\n');
  let token = '';
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const record = JSON.parse(lines[i]!) as { to?: string; text?: string };
    if (record.to === email && record.text) {
      const match = record.text.match(/token=([A-Za-z0-9_-]+)/);
      if (match) {
        token = match[1]!;
        break;
      }
    }
  }
  expect(token).not.toBe('');
  const verify = await api<{ verified: boolean }>('POST', '/auth/verify-email', { body: { token } });
  expect(verify.status).toBe(201);
  return { accessToken: reg.body.data!.tokens.accessToken };
}

beforeAll(async () => {
  if (!dbAvailable) return;

  // 1) Temiz test veritabanı
  const admin = new Client({ connectionString: ADMIN_DB_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  // 2) Migration'lar sıfırdan + seed
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

  // 3) Uygulama (medya: gecikmesiz işleme + geçici depo)
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.MAIL_OUTBOX_FILE = `/tmp/perdego-mail-${randomUUID().slice(0, 8)}.jsonl`;
  process.env.MEDIA_PROCESSING_DELAY_MS = '0';
  process.env.MEDIA_STORAGE_DIR = '/tmp/perdego-faz4-media-storage';

  // Örnek paketler (geliştirme ortamında üretilmişse) test deposuna taşınır;
  // yoksa test gerçek depo dizinine düşer (dürüst davranış: paket yoksa
  // oynatma uçları NET MEDIA_MISSING hatası verir).
  const realSamples = path.resolve(process.cwd(), 'media-storage');
  const { cpSync, existsSync } = await import('node:fs');
  if (samplesAvailable && !existsSync('/tmp/perdego-faz4-media-storage/samples')) {
    cpSync(realSamples, '/tmp/perdego-faz4-media-storage', { recursive: true });
  } else if (!samplesAvailable) {
    process.env.MEDIA_STORAGE_DIR = 'media-storage';
  }

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

describe.skipIf(!dbAvailable)('Faz 4 — medya altyapısı entegrasyon (gerçek PostgreSQL)', () => {
  beforeEach(async () => {
    app?.get(RateLimiterService)?.reset?.();
  });

  it('01 · konuk FREE oynatma oturumu: imzalı kaynaklar + altyazı listesi + süre bilgisi', async () => {
    const detail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string }> }> }>(
      'GET',
      '/catalog/titles/kayip-sinyal',
    );
    const episodeId = detail.body.data!.accessSeasons[0]!.episodes[0]!.id;
    const { status, body } = await api<{
      episodeId: string;
      provider: string;
      playbackUrl: string;
      sources: { hls?: string; mp4?: string };
      expiresAt: string;
      positionSeconds: number;
      quality: string[];
      guest: boolean;
      textTracks: Array<{ language: string; label: string; url: string }>;
    }>('POST', `/media/playback/${episodeId}/session`);

    expect(status).toBe(201);
    expect(body.ok).toBe(true);
    const session = body.data!;
    expect(session.episodeId).toBe(episodeId);
    expect(session.provider).toBe('LOCAL');
    expect(session.guest).toBe(true);
    expect(session.expiresAt > new Date().toISOString()).toBe(true);
    expect(session.playbackUrl).toContain('token=');
    expect(session.sources.hls).toBeTruthy();
    expect(session.quality.length).toBeGreaterThan(0);
    // Seed örnek paketleri tr/en demo altyazıyla gelir.
    expect(session.textTracks.map((t) => t.language).sort()).toEqual(['en', 'tr']);
    // İmzalı altyazı URL'i oturum parametrelerini taşır.
    expect(session.textTracks[0]!.url).toContain('token=');
  });

  it('02 · imzalı dosya servisi: manifest → segment → altyazı → mp4 (Range 206)', async () => {
    const detail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string }> }> }>(
      'GET',
      '/catalog/titles/kayip-sinyal',
    );
    const episodeId = detail.body.data!.accessSeasons[0]!.episodes[0]!.id;
    const session = (
      await api<{
        sources: { hls: string; mp4: string };
        textTracks: Array<{ language: string; url: string }>;
      }>('POST', `/media/playback/${episodeId}/session`)
    ).body.data!;

    // a) Manifest: segment satırları imzalı mutlak URL olmalı
    const manifestRes = await fetch(session.sources.hls!);
    expect(manifestRes.status).toBe(200);
    expect(manifestRes.headers.get('content-type')).toContain('mpegurl');
    const manifest = await manifestRes.text();
    expect(manifest).toContain('#EXTM3U');
    const segmentLine = manifest.split('\n').find((l) => l.includes('240p/playlist.m3u8'));
    expect(segmentLine).toContain('token=');
    expect(segmentLine).toContain(baseUrl);

    // b) Varyant playlist (imzalı) → segment
    const variantRes = await fetch(segmentLine!);
    expect(variantRes.status).toBe(200);
    const variant = await variantRes.text();
    const segLine = variant.split('\n').find((l) => l.includes('seg000.ts'));
    expect(segLine).toContain('token=');
    const segRes = await fetch(segLine!);
    expect(segRes.status).toBe(200);
    expect(segRes.headers.get('content-type')).toContain('mp2t');
    expect(Number(segRes.headers.get('content-length'))).toBeGreaterThan(0);

    // c) Altyazı (imzalı VTT)
    const vttRes = await fetch(session.textTracks.find((t) => t.language === 'tr')!.url);
    expect(vttRes.status).toBe(200);
    expect(vttRes.headers.get('content-type')).toContain('text/vtt');
    expect(await vttRes.text()).toContain('WEBVTT');

    // d) MP4 yedek akış + Range desteği
    const mp4Full = await fetch(session.sources.mp4!);
    expect(mp4Full.status).toBe(200);
    expect(mp4Full.headers.get('accept-ranges')).toBe('bytes');
    const mp4Range = await fetch(session.sources.mp4!, { headers: { Range: 'bytes=0-1023' } });
    expect(mp4Range.status).toBe(206);
    const partial = await mp4Range.arrayBuffer();
    expect(partial.byteLength).toBe(1024);
  });

  it('03 · imza ihlalleri: bozuk token ve geçmiş exp → 403 (dosya bile servis edilmez)', async () => {
    const detail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string }> }> }>(
      'GET',
      '/catalog/titles/kayip-sinyal',
    );
    const episodeId = detail.body.data!.accessSeasons[0]!.episodes[0]!.id;
    const session = (await api<{ sources: { hls: string } }>('POST', `/media/playback/${episodeId}/session`))
      .body.data!;
    const url = new URL(session.sources.hls!);

    const tampered = new URL(url);
    tampered.searchParams.set('token', 'saldiri-token');
    expect((await fetch(tampered)).status).toBe(403);

    const expired = new URL(url);
    expired.searchParams.set('exp', '1000000000');
    // exp değiştiği için imza da uyuşmaz → 403
    expect((await fetch(expired)).status).toBe(403);
  });

  it('04 · erişim kararı: SUBSCRIPTION konuk/aboneliksiz 402 → abonelikle 201; CREDIT 402; DRAFT 404', async () => {
    const subDetail = await api<{
      accessSeasons: Array<{ episodes: Array<{ id: string; accessType: string }> }>;
    }>('GET', '/catalog/titles/son-vardiya');
    const subEp = subDetail.body.data!.accessSeasons[0]!.episodes.find((e) => e.accessType === 'SUBSCRIPTION')!;

    // Konuk → 402
    const guestDenied = await api('POST', `/media/playback/${subEp.id}/session`);
    expect(guestDenied.status).toBe(402);
    expect(guestDenied.body.error?.details?.reason).toBe('NEEDS_SUBSCRIPTION');

    // Kayıtlı ama aboneliksiz → 402
    const email = `faz4-${randomUUID().slice(0, 8)}@perdego.dev`;
    const { accessToken } = await registerVerified('Faz 4 QA', email);
    const denied = await api('POST', `/media/playback/${subEp.id}/session`, { token: accessToken });
    expect(denied.status).toBe(402);

    // Simüle mağaza aboneliği → 201
    const validate = await api('POST', '/billing/purchases/validate', {
      token: accessToken,
      headers: { 'Idempotency-Key': randomUUID() },
      body: {
        platform: 'IOS',
        productType: 'SUBSCRIPTION',
        productId: 'SUB_MONTHLY',
        storeTransactionId: `sub-${randomUUID().slice(0, 8)}`,
      },
    });
    expect(validate.status).toBe(201);
    const allowed = await api<{ sources: { hls: string } }>('POST', `/media/playback/${subEp.id}/session`, {
      token: accessToken,
    });
    expect(allowed.status).toBe(201);

    // CREDIT bölümü — bakiye yetersiz → 402 NEEDS_CREDITS
    const creditDetail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string }> }> }>(
      'GET',
      '/catalog/titles/gizli-bahce',
    );
    const creditEp = creditDetail.body.data!.accessSeasons[0]!.episodes[0]!.id;
    const creditDenied = await api('POST', `/media/playback/${creditEp}/session`, {
      token: accessToken,
    });
    expect(creditDenied.status).toBe(402);
    expect(creditDenied.body.error?.details?.reason).toBe('NEEDS_CREDITS');

    // DRAFT içerik bölümü → 404 (herkese açık uçlar taslağı göstermez)
    const draftDetail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string }> }> }>(
      'GET',
      '/catalog/titles/yeni-baslangic',
    );
    expect(draftDetail.status).toBe(404);
  });

  it('05 · doğrudan yükleme akışı: upload-url → PUT → PROCESSING → sync READY → tek-READY → mp4 oynatımı', async () => {
    const admin = await login('admin@perdego.dev', 'Admin12345');

    // Yüklenecek hedef: FREE bölüm (yanki) — seed'den sample hazır READY gelir;
    // yeni yükleme READY olduğunda eskisi düşürülmeli (tek-READY kısıtı).
    const detail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string }> }> }>(
      'GET',
      '/catalog/titles/yanki',
    );
    const episodeId = detail.body.data!.accessSeasons[0]!.episodes[0]!.id;

    // a) Anahtar üretimi (rol korumalı)
    const viewer = await login('viewer@perdego.dev', 'Dev12345');
    const forbidden = await api('POST', `/admin/episodes/${episodeId}/media/upload-url`, {
      token: viewer,
      body: {},
    });
    expect(forbidden.status).toBe(403);

    const ticket = (await api<{
      mediaId: string;
      provider: string;
      uploadUrl: string;
      method: string;
      headers: Record<string, string>;
      maxSizeBytes: number;
      expiresAt: string;
    }>('POST', `/admin/episodes/${episodeId}/media/upload-url`, {
      token: admin,
      body: { originalName: 'bolum1.mp4', contentType: 'video/mp4' },
    })).body.data!;
    expect(ticket.provider).toBe('LOCAL');
    expect(ticket.method).toBe('PUT');
    expect(ticket.uploadUrl).toContain(`/media/upload/${ticket.mediaId}`);

    // b) Durum: AWAITING_UPLOAD
    const before = (await api<{ state: string }>('GET', `/admin/media/${ticket.mediaId}`, { token: admin }))
      .body.data!;
    expect(before.state).toBe('AWAITING_UPLOAD');

    // c) DOĞRUDAN yükleme (ham baytlar; JSON gövdesi değil) — sentetik mini MP4
    const ftyp = Buffer.from([0x00, 0x00, 0x00, 0x18]);
    const mp4Body = Buffer.concat([ftyp, Buffer.from('ftypisom', 'latin1'), Buffer.alloc(1024, 9)]);
    const put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: new Uint8Array(mp4Body),
    });
    expect(put.status).toBe(201);
    const uploaded = (await put.json() as Envelope<{ state: string; sizeBytes: number }>).data!;
    expect(uploaded.state).toBe('PROCESSING');
    expect(uploaded.sizeBytes).toBe(mp4Body.length);

    // Teşhis: PUT sonrası satır durumu gerçekten DB'de PROCESSING mi?
    const dbg = new Client({ connectionString: TEST_DB_URL });
    await dbg.connect();
    const dbgRow = await dbg.query('SELECT state, "sizeBytes" FROM episode_media WHERE id = $1', [ticket.mediaId]);
    await dbg.end();
    expect(dbgRow.rows[0]?.state).toBe('PROCESSING');

    // d) Sağlayıcı durumu yenilenir → READY (gecikmesiz test ortamı)
    const synced = (await api<{ state: string; playbackReady: boolean; durationSeconds: number | null }>(
      'POST',
      `/admin/media/${ticket.mediaId}/sync`,
      { token: admin },
    )).body.data!;
    expect(synced.state).toBe('READY');
    expect(synced.playbackReady).toBe(true);

    // e) Tek-READY kısıtı: eski sample READY artık ERROR, yeni yükleme READY
    const list = (await api<{ items: Array<{ state: string; mediaId: string }> }>(
      'GET',
      `/admin/episodes/${episodeId}/media`,
      { token: admin },
    )).body.data!;
    const readyRows = list.items.filter((m) => m.state === 'READY');
    expect(readyRows).toHaveLength(1);
    expect(readyRows[0]!.mediaId).toBe(ticket.mediaId);
    expect(list.items.some((m) => m.state === 'ERROR' && m.mediaId !== ticket.mediaId)).toBe(true);

    // f) Yeni medya ile oynatma: yalnızca mp4 kaynağı (yüklenen dosya HLS'siz)
    const session = (await api<{ sources: { hls?: string; mp4?: string }; textTracks: unknown[] }>(
      'POST',
      `/media/playback/${episodeId}/session`,
    )).body.data!;
    expect(session.sources.mp4).toBeTruthy();
    expect(session.sources.hls).toBeUndefined();
    // Yüklenen akış için demo altyazılar sunulur (sağlayıcı davranışı).
    expect(session.textTracks.length).toBeGreaterThan(0);
    const mp4Res = await fetch(session.sources.mp4!);
    expect(mp4Res.status).toBe(200);
    expect(mp4Res.headers.get('content-type')).toBe('video/mp4');
  });

  it('06 · yükleme anahtarı ihlalleri: bozuk token 403, ikinci yükleme 409', async () => {
    const admin = await login('admin@perdego.dev', 'Admin12345');
    const detail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string }> }> }>(
      'GET',
      '/catalog/titles/gece-yarisi-treni',
    );
    const episodeId = detail.body.data!.accessSeasons[0]!.episodes[0]!.id;
    const ticket = (await api<{ mediaId: string; uploadUrl: string }>(
      'POST',
      `/admin/episodes/${episodeId}/media/upload-url`,
      { token: admin, body: {} },
    )).body.data!;

    // Bozuk token
    const bad = new URL(ticket.uploadUrl);
    bad.searchParams.set('token', 'saldiri');
    const badRes = await fetch(bad, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: new Uint8Array(Buffer.alloc(64, 1)),
    });
    expect(badRes.status).toBe(403);

    // İlk yükleme
    const ftyp = Buffer.from([0x00, 0x00, 0x00, 0x18]);
    const mp4 = Buffer.concat([ftyp, Buffer.from('ftypisom', 'latin1'), Buffer.alloc(128, 3)]);
    const ok = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: new Uint8Array(mp4),
    });
    expect(ok.status).toBe(201);

    // İkinci yükleme → 409 MEDIA_ALREADY_UPLOADED
    const again = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: new Uint8Array(mp4),
    });
    expect(again.status).toBe(409);
    expect((await again.json() as Envelope).error?.details?.reason).toBe('MEDIA_ALREADY_UPLOADED');
  });

  it('07 · örnek paket dosyaları yerindeyse master HLS gerçek segment listesi içerir', async () => {
    if (!samplesAvailable) {
      console.warn('[faz4] örnek paketler üretilmemiş (scripts/generate-sample-media.sh) — test SKIP.');
      return;
    }
    const detail = await api<{ accessSeasons: Array<{ episodes: Array<{ id: string }> }> }>(
      'GET',
      '/catalog/titles/kayip-sinyal',
    );
    const episodeId = detail.body.data!.accessSeasons[0]!.episodes[0]!.id;
    const session = (await api<{ sources: { hls: string } }>('POST', `/media/playback/${episodeId}/session`))
      .body.data!;
    const manifest = await (await fetch(session.sources.hls!)).text();
    expect(manifest).toContain('360p/playlist.m3u8');
    expect(manifest).toContain('540p/playlist.m3u8');
    expect(manifest).toContain('SUBTITLES="subs"');
  });
});
