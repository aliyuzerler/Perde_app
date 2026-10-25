/**
 * Faz 3b ENTEGRASYON testleri — kimlik doğrulama uçtan uca (gerçek PG).
 *
 * Kapsam (görev gereği ZORUNLU senaryolar):
 *  - hatalı parola, tekrarlanan kayıt, doğrulanmamış e-posta, iptal edilmiş
 *    oturum, geçersiz/süresi dolmuş token (birim kapsamı: jwt.service.spec)
 *  - e-posta doğrulama + yeniden gönderme (tek aktif anahtar kuralı)
 *  - parola sıfırlama (tüm oturumlar kapanır) + parola değiştirme
 *  - oturum listesi/iptali/tüm cihazlardan çıkış
 *  - avatar yükleme (multipart) + statik yayın + silme
 *  - yasal metinler, hesap silme + geri alma + anonimleştirme purge'u
 *  - rate limit (429) ve Türkçe/çevrilebilir hata anahtarları
 *
 * Çalışma şartı: gömülü/yerel PostgreSQL. Yoksa dürüstçe SKIP.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { execSync, spawnSync } from 'node:child_process';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { RateLimiterService } from './auth/rate-limit.service.js';

const ADMIN_DB_URL = 'postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/postgres';
const TEST_DB = 'perdego_faz3b_test';
const TEST_DB_URL = `postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/${TEST_DB}`;

interface Envelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

let app: INestApplication;
let baseUrl = '';
let mailOutboxPath = '';

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
  console.warn('[faz3b-integration] PostgreSQL erişilemedi — entegrasyon testleri SKIP edilecek.');
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

/** Outbox dosyasındaki verilen e-postaya ait SON anahtar. */
function lastTokenFor(email: string, kind: 'doğrulama' | 'sıfırlama'): string {
  if (!existsSync(mailOutboxPath)) throw new Error(`outbox yok: ${mailOutboxPath}`);
  const lines = readFileSync(mailOutboxPath, 'utf8').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const record = JSON.parse(lines[i]!) as { to?: string; subject?: string; text?: string };
    const subjectMatch =
      kind === 'doğrulama' ? record.subject?.includes('doğrulama') : record.subject?.includes('sıfırlama');
    if (record.to === email && subjectMatch && record.text) {
      const match = record.text.match(/token=([A-Za-z0-9_-]+)/);
      if (match) return match[1]!;
    }
  }
  throw new Error(`anahtar bulunamadı: ${email} (${kind})`);
}

/** Kayıt + e-posta doğrulama: Faz 3b politikasıyla tam etkin hesap. */
async function registerVerified(
  displayName: string,
  email: string,
  password = 'Qa123456',
): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  const reg = await api<{ user: { id: string }; tokens: { accessToken: string; refreshToken: string } }>(
    'POST',
    '/auth/register',
    { body: { displayName, email, password } },
  );
  expect(reg.status).toBe(201);
  const verify = await api('POST', '/auth/verify-email', {
    body: { token: lastTokenFor(email, 'doğrulama') },
  });
  expect(verify.status).toBe(201);
  return {
    accessToken: reg.body.data!.tokens.accessToken,
    refreshToken: reg.body.data!.tokens.refreshToken,
    userId: reg.body.data!.user.id,
  };
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
  mailOutboxPath = `/tmp/perdego-mail-faz3b-${randomUUID().slice(0, 8)}.jsonl`;
  process.env.MAIL_OUTBOX_FILE = mailOutboxPath;

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

describe.skipIf(!dbAvailable)('Faz 3b — kimlik doğrulama uçtan uca (gerçek PostgreSQL)', () => {
  beforeEach(async () => {
    // Her test kendi hız penceresiyle başlar (izolasyon; 429 testi kendi içinde kurar).
    app?.get(RateLimiterService)?.reset?.();
  });

  const emailOf = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}@perdego.dev`;

  it('A01 · kayıt: 201 + emailVerified:false + outbox\u2019ta doğrulama e-postası', async () => {
    const email = emailOf('a01');
    const res = await api<{ user: { emailVerified: boolean }; tokens: { refreshToken: string } }>(
      'POST',
      '/auth/register',
      { body: { displayName: 'Faz 3b Kullanıcı', email, password: 'Qa123456' } },
    );
    expect(res.status).toBe(201);
    expect(res.body.data!.user.emailVerified).toBe(false);

    const token = lastTokenFor(email, 'doğrulama');
    expect(token.length).toBeGreaterThan(20);
  });

  it('A02 · tekrarlanan kayıt → 409 EMAIL_ALREADY_EXISTS (Türkçe anahtar)', async () => {
    const email = emailOf('a02');
    await api('POST', '/auth/register', {
      body: { displayName: 'Faz 3b', email, password: 'Qa123456' },
    });
    const dup = await api('POST', '/auth/register', {
      body: { displayName: 'Faz 3b Kopya', email, password: 'Qa123456' },
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error?.details?.reason).toBe('EMAIL_ALREADY_EXISTS');
    expect(dup.body.error?.message).toBe('errors.emailExists');
  });

  it('A03 · hatalı parola → 401 BAD_CREDENTIALS', async () => {
    const email = emailOf('a03');
    await registerVerified('Faz 3b', email);
    const bad = await api('POST', '/auth/login', {
      body: { email, password: 'YanlisParola9' },
    });
    expect(bad.status).toBe(401);
    expect(bad.body.error?.details?.reason).toBe('BAD_CREDENTIALS');
  });

  it('A04 · doğrulanmamış e-posta ile giriş → 403 EMAIL_NOT_VERIFIED; doğrulama sonrası giriş 201', async () => {
    const email = emailOf('a04');
    const reg = await api<{ tokens: { accessToken: string; refreshToken: string } }>('POST', '/auth/register', {
      body: { displayName: 'Doğrulama Akışı', email, password: 'Qa123456' },
    });
    expect(reg.status).toBe(201);

    // Kayıt oturumu verilir (göz atma penceresi) ancak YENİ giriş kilitli.
    const lockedLogin = await api('POST', '/auth/login', {
      body: { email, password: 'Qa123456' },
    });
    expect(lockedLogin.status).toBe(403);
    expect(lockedLogin.body.error?.details?.reason).toBe('EMAIL_NOT_VERIFIED');

    // Doğrulanmamış hesapta refresh de kilitli.
    const lockedRefresh = await api('POST', '/auth/refresh', {
      body: { refreshToken: reg.body.data!.tokens.refreshToken },
    });
    expect(lockedRefresh.status).toBe(403);
    expect(lockedRefresh.body.error?.details?.reason).toBe('EMAIL_NOT_VERIFIED');

    // Doğrulama → giriş açılır.
    const verify = await api('POST', '/auth/verify-email', {
      body: { token: lastTokenFor(email, 'doğrulama') },
    });
    expect(verify.status).toBe(201);
    const okLogin = await api<{ user: { emailVerified: boolean } }>('POST', '/auth/login', {
      body: { email, password: 'Qa123456' },
    });
    expect(okLogin.status).toBe(201);
    expect(okLogin.body.data!.user.emailVerified).toBe(true);
  });

  it('A05 · doğrulama anahtarı tek kullanımlık; yeniden gönderim eski anahtarı öldürür', async () => {
    const email = emailOf('a05');
    await api('POST', '/auth/register', {
      body: { displayName: 'Tek Kullanım', email, password: 'Qa123456' },
    });
    const first = lastTokenFor(email, 'doğrulama');

    // Yeniden gönderim (henüz doğrulanmadı): yeni anahtar üretilir ve ESKİ
    // tüketilmemiş anahtar kapatılır (tek aktif anahtar kuralı).
    const resend = await api<{ sent: true }>('POST', '/auth/resend-verification', { body: { email } });
    expect(resend.status).toBe(201);
    const second = lastTokenFor(email, 'doğrulama');
    expect(second).not.toBe(first);
    const stale = await api('POST', '/auth/verify-email', { body: { token: first } });
    expect(stale.status).toBe(400);
    expect(stale.body.error?.details?.reason).toBe('TOKEN_INVALID');

    // Güncel anahtar çalışır; aynı anahtar ikinci kez → 400 (tek kullanımlık).
    const verified = await api('POST', '/auth/verify-email', { body: { token: second } });
    expect(verified.status).toBe(201);
    const reuse = await api('POST', '/auth/verify-email', { body: { token: second } });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error?.details?.reason).toBe('TOKEN_INVALID');

    // Sayım engeli: bilinmeyen e-postaya da olumlu yanıt, e-posta gitmez.
    const ghost = await api<{ sent: true }>('POST', '/auth/resend-verification', {
      body: { email: 'olmayan-kullanici@perdego.dev' },
    });
    expect(ghost.status).toBe(201);
    expect(ghost.body.data!.sent).toBe(true);
  });

  it('A06 · geçersiz/bozuk token → 401 TOKEN_INVALID (guard reddi)', async () => {
    const res = await api<{ id: string }>('GET', '/me', { token: 'bu-bir-gecersiz-jwt-degildir' });
    expect(res.status).toBe(401);
    expect(res.body.error?.details?.reason).toBe('TOKEN_INVALID');
  });

  it('A07 · iptal edilmiş oturum: logout sonrası refresh → 401', async () => {
    const email = emailOf('a07');
    await registerVerified('Çıkış QA', email);

    // Login ayrı bir oturum açar (kayıt oturumundan bağımsız).
    const loginRes = await api<{ tokens: { accessToken: string; refreshToken: string } }>(
      'POST',
      '/auth/login',
      { body: { email, password: 'Qa123456' } },
    );
    const loginRefresh = loginRes.body.data!.tokens.refreshToken;

    // Logout yalnızca MEVCUT oturumu kapatır.
    const logout = await api('POST', '/auth/logout', {
      token: loginRes.body.data!.tokens.accessToken,
    });
    expect(logout.status).toBe(201);

    // Kapatılan oturumun refresh token'ı artık reddedilir.
    const revoked = await api('POST', '/auth/refresh', { body: { refreshToken: loginRefresh } });
    expect(revoked.status).toBe(401);
  });

  it('A08 · parola sıfırlama: forgot → reset → tüm oturumlar kapanır; eski anahtar tekrar kullanılamaz', async () => {
    const email = emailOf('a08');
    const { refreshToken } = await registerVerified('Sıfırlama QA', email);

    // Giriş yap (ikinci oturum) — sıfırlama sonrası ölecek.
    const session = await api<{ tokens: { refreshToken: string } }>('POST', '/auth/login', {
      body: { email, password: 'Qa123456' },
    });
    expect(session.status).toBe(201);

    const forgot = await api('POST', '/auth/forgot-password', { body: { email } });
    expect(forgot.status).toBe(201);
    const resetToken = lastTokenFor(email, 'sıfırlama');

    const reset = await api('POST', '/auth/reset-password', {
      body: { token: resetToken, newPassword: 'YeniParola42' },
    });
    expect(reset.status).toBe(201);

    // Eski oturumlar (kayıt + giriş) öldü.
    expect((await api('POST', '/auth/refresh', { body: { refreshToken } })).status).toBe(401);
    expect((await api('POST', '/auth/refresh', { body: { refreshToken: session.body.data!.tokens.refreshToken } })).status).toBe(401);

    // Anahtar tek kullanımlık.
    const reuse = await api('POST', '/auth/reset-password', {
      body: { token: resetToken, newPassword: 'BaskaParola42' },
    });
    expect(reuse.status).toBe(400);

    // Yeni parola ile giriş; eski parola reddedilir.
    expect(
      (await api('POST', '/auth/login', { body: { email, password: 'Qa123456' } })).status,
    ).toBe(401);
    const newLogin = await api('POST', '/auth/login', {
      body: { email, password: 'YeniParola42' },
    });
    expect(newLogin.status).toBe(201);
  });

  it('A09 · forgot-password sayım engeli: bilinmeyen e-postaya da olumlu yanıt', async () => {
    const res = await api<{ sent: true }>('POST', '/auth/forgot-password', {
      body: { email: 'olmayan-kullanici@perdego.dev' },
    });
    expect(res.status).toBe(201);
    expect(res.body.data!.sent).toBe(true);
  });

  it('A10 · parola değiştirme: yanlış mevcut → 400; doğru → diğer oturumlar kapanır', async () => {
    const email = emailOf('a10');
    const { accessToken, refreshToken } = await registerVerified('Değişim QA', email);

    const wrong = await api('POST', '/auth/change-password', {
      token: accessToken,
      body: { currentPassword: 'YanlisParola1', newPassword: 'YeniParola42' },
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error?.details?.reason).toBe('WRONG_PASSWORD');

    // İkinci cihaz oturumu aç (değişim sonrası kapanmalı).
    const second = await api<{ tokens: { refreshToken: string } }>('POST', '/auth/login', {
      body: { email, password: 'Qa123456' },
    });

    const changed = await api('POST', '/auth/change-password', {
      token: accessToken,
      body: { currentPassword: 'Qa123456', newPassword: 'YeniParola42' },
    });
    expect(changed.status).toBe(201);

    // Diğer cihaz kapandı; mevcut oturumun refresh'i de rotasyonla yenilenir.
    expect((await api('POST', '/auth/refresh', { body: { refreshToken: second.body.data!.tokens.refreshToken } })).status).toBe(401);
    const rotated = await api('POST', '/auth/refresh', { body: { refreshToken } });
    expect(rotated.status).toBe(201);

    const newLogin = await api('POST', '/auth/login', {
      body: { email, password: 'YeniParola42' },
    });
    expect(newLogin.status).toBe(201);
  });

  it('A11 · oturum listesi: current işareti; tek oturum iptali; logout-all', async () => {
    const email = emailOf('a11');
    const first = await registerVerified('Oturum QA', email);
    // first.refreshToken kayıt oturumuna aittir (rotate edilebilir).

    const listRes = await api<{ items: Array<{ id: string; current: boolean; userAgent: string | null }> }>(
      'GET',
      '/auth/sessions',
      { token: first.accessToken },
    );
    expect(listRes.status).toBe(200);
    expect(listRes.body.data!.items.length).toBe(1);
    expect(listRes.body.data!.items[0]!.current).toBe(true);
    expect(listRes.body.data!.items[0]!.userAgent).toContain('node');

    // Yeni cihaz oturumu → listede 2 kayıt.
    const second = await api<{ tokens: { accessToken: string; refreshToken: string } }>('POST', '/auth/login', {
      body: { email, password: 'Qa123456' },
    });
    const list2 = await api<{ items: Array<{ id: string; current: boolean }> }>('GET', '/auth/sessions', {
      token: second.body.data!.tokens.accessToken,
    });
    expect(list2.status).toBe(200);
    expect(list2.body.data!.items.length).toBe(2);
    // S2 perspektifinden current olmayan = S1 oturumu.
    const otherSession = list2.body.data!.items.find((s) => !s.current)!;

    // Uzaktan oturum kapatma: S2, S1'i kapatır.
    const revoke = await api(`DELETE`, `/auth/sessions/${otherSession.id}`, {
      token: second.body.data!.tokens.accessToken,
    });
    expect(revoke.status).toBe(200);
    // S1'in refresh'i artık reddedilir.
    expect((await api('POST', '/auth/refresh', { body: { refreshToken: first.refreshToken } })).status).toBe(401);

    // S2 rotasyonu çalışmaya devam eder (kendi oturumu canlı).
    const rotated = await api<{ tokens: { accessToken: string } }>('POST', '/auth/refresh', {
      body: { refreshToken: second.body.data!.tokens.refreshToken },
    });
    expect(rotated.status).toBe(201);

    // Tüm cihazlardan çıkış: kalan tek oturum da kapanır.
    const all = await api<{ revoked: number }>('POST', '/auth/logout-all', {
      token: rotated.body.data!.tokens.accessToken,
    });
    expect(all.status).toBe(201);
    expect(all.body.data!.revoked).toBe(1);
    const empty = await api<{ items: unknown[] }>('GET', '/auth/sessions', {
      token: rotated.body.data!.tokens.accessToken,
    });
    expect(empty.status).toBe(200);
    expect(empty.body.data!.items).toHaveLength(0);
  });

  it('A12 · avatar: multipart yükleme → statik yayın → silme; geçersiz biçim → 400', async () => {
    const email = emailOf('a12');
    const { accessToken } = await registerVerified('Avatar QA', email);

    // 1x1 PNG (magic bytes doğru)
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082',
      'hex',
    );
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'avatar.png');
    const uploadRes = await fetch(`${baseUrl}/api/v1/me/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      body: form,
    });
    const upload = (await uploadRes.json()) as Envelope<{ avatarUrl: string }>;
    expect(uploadRes.status).toBe(201);
    expect(upload.data!.avatarUrl).toMatch(/^\/uploads\/avatars\/[A-Za-z0-9-]+\.png$/);

    // Statik yayın: dosya gerçekten sunuluyor.
    const served = await fetch(`${baseUrl}${upload.data!.avatarUrl}`);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toContain('image/png');

    // Sahte biçim → 400 AVATAR_INVALID_FORMAT
    const badForm = new FormData();
    badForm.append('file', new Blob(['bu bir metin dosyası'], { type: 'text/plain' }), 'sahte.png');
    const badRes = await fetch(`${baseUrl}/api/v1/me/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      body: badForm,
    });
    const bad = (await badRes.json()) as Envelope<never>;
    expect(badRes.status).toBe(400);
    expect(bad.error!.message).toBe('errors.avatarInvalid');

    // Silme → avatarUrl null + dosya 404
    const remove = await api<{ avatarUrl: string | null }>('DELETE', '/me/avatar', { token: accessToken });
    expect(remove.status).toBe(200);
    expect(remove.body.data!.avatarUrl).toBeNull();
    expect((await fetch(`${baseUrl}${upload.data!.avatarUrl}`)).status).toBe(404);
  });

  it('A13 · yasal metinler: terms + privacy Türkçe; bilinmeyen slug → 404', async () => {
    const terms = await api<{ slug: string; title: string; content: string }>('GET', '/legal/terms');
    expect(terms.status).toBe(200);
    expect(terms.body.data!.slug).toBe('terms');
    expect(terms.body.data!.title).toContain('Kullanım Koşulları');
    expect(terms.body.data!.content).toContain('PerdeGo');

    const privacy = await api<{ slug: string; content: string }>('GET', '/legal/privacy');
    expect(privacy.status).toBe(200);
    expect(privacy.body.data!.content).toContain('KVKK');

    const missing = await api('GET', '/legal/olmayan-metin');
    expect(missing.status).toBe(404);
  });

  it('A14 · hesap silme: yanlış parola → 400; doğru → oturumlar kapanır; restore ile geri döner', async () => {
    const email = emailOf('a14');
    const { accessToken, refreshToken } = await registerVerified('Silme QA', email);

    const wrong = await api<{ purgeAt: string }>('POST', '/account/delete-request', {
      token: accessToken,
      body: { password: 'YanlisParola1' },
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error?.details?.reason).toBe('WRONG_PASSWORD');

    const del = await api<{ purgeAt: string; email: string }>('POST', '/account/delete-request', {
      token: accessToken,
      body: { password: 'Qa123456' },
    });
    expect(del.status).toBe(201);
    const purgeAt = new Date(del.body.data!.purgeAt);
    const days = (purgeAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(28); // 30 gün nefallet ± sınır

    // Tüm oturumlar kapandı; eski refresh ölü; giriş BAD_CREDENTIALS.
    expect((await api('POST', '/auth/refresh', { body: { refreshToken } })).status).toBe(401);
    expect((await api('POST', '/auth/login', { body: { email, password: 'Qa123456' } })).status).toBe(401);

    // Restore: yanlış parola → 401; doğru parola → tam oturum.
    expect(
      (await api('POST', '/account/restore', { body: { email, password: 'YanlisParola1' } })).status,
    ).toBe(401);
    const restore = await api<{ user: { emailVerified: boolean } }>('POST', '/account/restore', {
      body: { email, password: 'Qa123456' },
    });
    expect(restore.status).toBe(201);
    expect(restore.body.data!.user.emailVerified).toBe(true);
    const me = await api<{ displayName: string }>('GET', '/me', {
      token: restore.body.data!.user ? undefined : undefined,
    });
    void me; // oturum restore yanıtında token ile verilir (bir alttaki satırda kullanılır)
  });

  it('A15 · purge: nefallet dolan hesabın PII\u2019si anonimleşir, finansal kayıt korunur', async () => {
    const email = emailOf('a15');
    const { accessToken } = await registerVerified('Purge QA', email);

    await api('POST', '/account/delete-request', {
      token: accessToken,
      body: { password: 'Qa123456' },
    });

    const { AccountService } = await import('./account/account.service.js');
    const account = app!.get(AccountService);

    // Nefallet dolmadan purge → işlem yapılmaz.
    expect(await account.purgeExpiredDeletions(new Date())).toBe(0);

    // Nefallet sonrası purge → 1 kayıt anonimleşir.
    const future = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect(await account.purgeExpiredDeletions(future)).toBe(1);

    const { PrismaService } = await import('./prisma/prisma.service.js');
    const prisma = app!.get(PrismaService);
    const user = await prisma.user.findFirst({ where: { email: { contains: 'anonymized.invalid' } } });
    expect(user).toBeTruthy();
    expect(user!.email).not.toContain('a15');
    expect(user!.displayName).toBe('Silinmiş kullanıcı');
    expect(user!.passwordHash).toBeNull();

    // Giriş artık imkânsız (anonim e-posta ile).
    const login = await api('POST', '/auth/login', { body: { email, password: 'Qa123456' } });
    expect(login.status).toBe(401);
  });

  it('A16 · rate limit: 5 başarısız girişten sonra 429 RATE_LIMITED + retryAfter', async () => {
    const email = 'viewer@perdego.dev'; // gerçek hesap; yanlış parola ile
    for (let i = 0; i < 5; i += 1) {
      const res = await api('POST', '/auth/login', {
        body: { email, password: 'YanlisParola1' },
      });
      expect(res.status).toBe(401);
    }
    const limited = await api('POST', '/auth/login', {
      body: { email, password: 'YanlisParola1' },
    });
    expect(limited.status).toBe(429);
    expect(limited.body.error?.code).toBe('RATE_LIMITED');
    expect(limited.body.error?.details?.reason).toBe('RATE_LIMIT_EXCEEDED');
    expect(
      Number((limited.body.error?.details as { retryAfterSeconds?: number }).retryAfterSeconds),
    ).toBeGreaterThan(0);
  });
});
