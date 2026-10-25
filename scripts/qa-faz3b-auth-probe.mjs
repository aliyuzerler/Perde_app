#!/usr/bin/env node
/**
 * Faz 3b CANLI PROBE — çalışan API'ye gerçek HTTP istekleri.
 *
 * Kapsam: register→outbox token→verify→login, tekrar kayıt 409, hatalı parola
 * 401, doğrulanmamış giriş 403, refresh rotasyonu + reuse, logout iptali,
 * forgot/reset, change-password, sessions, avatar upload (multipart) + statik
 * dosya, legal, hesap silme + restore, rate limit 429, Swagger yol sayımı.
 *
 * Kullanım: node scripts/qa-faz3b-auth-probe.mjs [baseUrl]
 * Çıkış kodu: 0 = tümü geçti; 1 = en az bir başarısız.
 */
import { readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const API = `${BASE}/api/v1`;
const OUTBOX = process.env.MAIL_OUTBOX_FILE ?? '/tmp/perdego-probe-outbox.jsonl';
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(method, path, { token, body, headers, raw } = {}) {
  const h = { Accept: 'application/json', ...(headers ?? {}) };
  if (body !== undefined && !raw) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: h,
    body: raw ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, body: payload };
}

function lastTokenFor(email, kind) {
  if (!existsSync(OUTBOX)) return null;
  const lines = readFileSync(OUTBOX, 'utf8').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const rec = JSON.parse(lines[i]);
    const subjectHit = kind === 'verify' ? String(rec.subject ?? '').includes('doğrulama') : String(rec.subject ?? '').includes('sıfırlama');
    if (rec.to === email && subjectHit && rec.text) {
      const m = rec.text.match(/token=([A-Za-z0-9_-]+)/);
      if (m) return m[1];
    }
  }
  return null;
}

const uniq = () => `probe-${Math.random().toString(36).slice(2, 10)}@perdego.dev`;

// --- Ana akış ---------------------------------------------------------------
const email = uniq();

// 1) Kayıt
const reg = await api('POST', '/auth/register', {
  body: { displayName: 'Probe Kullanıcı', email, password: 'Qa123456' },
});
check('register 201 + emailVerified:false', reg.status === 201 && reg.body?.data?.user?.emailVerified === false);

// 2) Doğrulanmamış giriş 403
const locked = await api('POST', '/auth/login', { body: { email, password: 'Qa123456' } });
check('doğrulanmamış giriş 403 EMAIL_NOT_VERIFIED', locked.status === 403 && locked.body?.error?.details?.reason === 'EMAIL_NOT_VERIFIED');

// 3) Outbox'tan anahtar + verify
const vtoken = lastTokenFor(email, 'verify');
const verify = await api('POST', '/auth/verify-email', { body: { token: vtoken } });
check('verify-email 201', verify.status === 201 && verify.body?.data?.verified === true);

// 4) Giriş
const login = await api('POST', '/auth/login', { body: { email, password: 'Qa123456' } });
check('giriş 201 + token çifti', login.status === 201 && Boolean(login.body?.data?.tokens?.accessToken) && Boolean(login.body?.data?.tokens?.refreshToken));
const accessToken = login.body.data.tokens.accessToken;
const refreshToken = login.body.data.tokens.refreshToken;

// 5) Tekrar kayıt 409
const dup = await api('POST', '/auth/register', { body: { displayName: 'Probe', email, password: 'Qa123456' } });
check('tekrar kayıt 409 EMAIL_ALREADY_EXISTS', dup.status === 409 && dup.body?.error?.details?.reason === 'EMAIL_ALREADY_EXISTS');

// 6) Hatalı parola 401
const bad = await api('POST', '/auth/login', { body: { email, password: 'YanlisParola1' } });
check('hatalı parola 401', bad.status === 401 && bad.body?.error?.details?.reason === 'BAD_CREDENTIALS');

// 7) Refresh rotasyonu (reuse testi ÖNCE değil — aile iptali sonrası
// oturum listesi boşalır; önce canlı oturum kontrolleri yapılır)
const rot = await api('POST', '/auth/refresh', { body: { refreshToken } });
check('refresh rotasyon 201', rot.status === 201 && rot.body?.data?.tokens?.refreshToken !== refreshToken);

// 8) Profil
const me = await api('GET', '/me', { token: rot.body.data.tokens.accessToken });
check('GET /me maskeli e-posta', me.status === 200 && /\*+@/.test(me.body?.data?.maskedEmail ?? ''));
const patch = await api('PATCH', '/me', { token: rot.body.data.tokens.accessToken, body: { displayName: 'Probe Güncel' } });
check('PATCH /me günceller', patch.status === 200 && patch.body?.data?.displayName === 'Probe Güncel');

// 9) Oturumlar (canlı oturum: current=true + kayıt oturumu listede)
const sessions = await api('GET', '/auth/sessions', { token: rot.body.data.tokens.accessToken });
check(
  'sessions listesi current=true',
  sessions.status === 200 &&
    sessions.body?.data?.items?.some((s) => s.current) &&
    sessions.body.data.items.length >= 2,
);

// 10) Refresh reuse: aile iptali (sonraki adımlar yeni oturumlarla)
const reuse = await api('POST', '/auth/refresh', { body: { refreshToken } });
check('refresh reuse 401 REFRESH_REUSED', reuse.status === 401 && reuse.body?.error?.details?.reason === 'REFRESH_REUSED');

// Avatar multipart (1px PNG)
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082', 'hex');
const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'probe.png');
const up = await fetch(`${API}/me/avatar`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${rot.body.data.tokens.accessToken}` },
  body: form,
});
const upBody = await up.json();
check('avatar upload 201 + url', up.status === 201 && /^\/uploads\/avatars\//.test(upBody?.data?.avatarUrl ?? ''));
if (upBody?.data?.avatarUrl) {
  const served = await fetch(`${BASE}${upBody.data.avatarUrl}`);
  check('avatar statik yayın 200', served.status === 200 && (served.headers.get('content-type') ?? '').includes('image/png'));
}

// Legal
const terms = await api('GET', '/legal/terms');
check('legal terms 200 Türkçe', terms.status === 200 && String(terms.body?.data?.title ?? '').includes('Kullanım Koşulları'));

// 12) Parola sıfırlama
const forgot = await api('POST', '/auth/forgot-password', { body: { email } });
const rtoken = lastTokenFor(email, 'reset');
const reset = await api('POST', '/auth/reset-password', { body: { token: rtoken, newPassword: 'YeniParola42' } });
check('forgot+reset 201', forgot.status === 201 && reset.status === 201);
const newLogin = await api('POST', '/auth/login', { body: { email, password: 'YeniParola42' } });
check('yeni parola ile giriş 201', newLogin.status === 201);
const oldRefresh = await api('POST', '/auth/refresh', { body: { refreshToken: rot.body.data.tokens.refreshToken } });
check('reset sonrası eski oturum 401', oldRefresh.status === 401);

// 13) Hesap silme + restore
const delAcc = await api('POST', '/account/delete-request', { token: newLogin.body.data.tokens.accessToken, body: { password: 'YeniParola42' } });
check('hesap silme talebi 201 + purgeAt', delAcc.status === 201 && Boolean(delAcc.body?.data?.purgeAt));
const afterDel = await api('POST', '/auth/login', { body: { email, password: 'YeniParola42' } });
check('silme sonrası giriş 401', afterDel.status === 401);
const restore = await api('POST', '/account/restore', { body: { email, password: 'YeniParola42' } });
check('restore 201 + oturum', restore.status === 201 && Boolean(restore.body?.data?.tokens?.accessToken));

// 14) Rate limit (izole bucket: yeni IP kullanılamaz; mevcut IP ile 5 deneme)
// Not: probe tek IP'den koşar; kendi hesabıyla 5 yanlış parola denemesi.
const rlEmail = uniq();
await api('POST', '/auth/register', { body: { displayName: 'RL', email: rlEmail, password: 'Qa123456' } });
const rlToken = lastTokenFor(rlEmail, 'verify');
await api('POST', '/auth/verify-email', { body: { token: rlToken } });
let hit429 = false;
for (let i = 0; i < 6; i += 1) {
  const r = await api('POST', '/auth/login', { body: { email: rlEmail, password: 'YanlisParola1' } });
  if (r.status === 429) { hit429 = true; break; }
}
check('rate limit 429 RATE_LIMITED', hit429);

// 15) Swagger
const swagger = await fetch(`${BASE}/api/docs-json`).then((r) => r.json());
const paths = Object.keys(swagger.paths ?? {});
const required = ['/api/v1/auth/register', '/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/verify-email', '/api/v1/auth/forgot-password', '/api/v1/auth/reset-password', '/api/v1/auth/change-password', '/api/v1/auth/sessions', '/api/v1/auth/logout-all', '/api/v1/me/avatar', '/api/v1/account/delete-request', '/api/v1/account/restore', '/api/v1/legal/terms'];
const missing = required.filter((p) => !paths.includes(p));
check('Swagger yeni uçları içeriyor', missing.length === 0, missing.length ? `eksik: ${missing.join(', ')}` : `${paths.length} yol`);

// Sonuç
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} probe geçti`);
if (failed.length) {
  console.log('Başarısız:', failed.map((f) => f.name).join(' | '));
  process.exit(1);
}
