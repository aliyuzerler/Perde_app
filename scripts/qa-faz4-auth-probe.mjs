#!/usr/bin/env node
/**
 * FAZ 4 QA — Kimlik doğrulama uçtan uca canlı probe (3 fazlı):
 *
 *   node qa-faz4-auth-probe.mjs functional   → pozitif + negatif senaryolar
 *   node qa-faz4-auth-probe.mjs ratelimit    → 429 sınır testleri (varsayılan limitler)
 *   node qa-faz4-auth-probe.mjs expiry       → access token TTL + oturum yenileme (TTL=60)
 *
 * API ortamları (bash tarafında başlatılır):
 *   functional : AUTH_RATE_LIMIT_*_MAX=100  (fonksiyonel testler sınıra takılmasın)
 *   ratelimit  : varsayılan limitler (login 5 / register 3 / reset 3, pencere 60sn)
 *   expiry     : ACCESS_TOKEN_TTL_SECONDS=60 + generous limitler
 *
 * Sonuçlar: /tmp/faz4-probe-<phase>.json + kullanılan sırlar /tmp/faz4-secrets.txt
 * (log sızıntısı denetimi bash tarafında bu dosya ile yapılır).
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const BASE = 'http://localhost:3000/api/v1';
const DB_URL = 'postgresql://perdego:perdego_dev_pass@localhost:5432/perdego?schema=public';
const OUTBOX = '/home/z/my-project/apps/api/.mail-outbox.jsonl';
const PHASE = process.argv[2] ?? 'functional';
const STAMP = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const RUN = Math.random().toString(36).slice(2, 7);

const require = createRequire(import.meta.url);
const { Client } = require('/home/z/my-project/scripts/qa-pg/node_modules/pg');

const results = [];
const secrets = []; // log sızıntısı denetimi için: [tür, değer]

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(method, path, opts = {}) {
  const { token, body, form } = opts;
  const headers = { Accept: 'application/json' };
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) payload = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  let json = null;
  try { json = await res.json(); } catch { /* gövdesiz yanıt */ }
  return { status: res.status, body: json, headers: res.headers };
}

function reason(r) {
  return r?.body?.error?.details?.reason ?? r?.body?.error?.code ?? '-';
}

function lastTokenFor(email, kind) {
  if (!existsSync(OUTBOX)) return null;
  const lines = readFileSync(OUTBOX, 'utf8').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    let rec;
    try { rec = JSON.parse(lines[i]); } catch { continue; }
    if (rec.to !== email) continue;
    const text = String(rec.text ?? '') + String(rec.html ?? '');
    const re = kind === 'VERIFY'
      ? /verify-email\?token=([A-Za-z0-9_-]+)/
      : /reset-password\?token=([A-Za-z0-9_-]+)/;
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}

async function dbExec(sql, params = []) {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try { return await client.query(sql, params); } finally { await client.end(); }
}

const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

// 1×1 PNG (magic byte testi için gerçek PNG imzası)
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PW1 = `Faz4Aa1-${RUN}x`; // harf+rakam, ≥8
const PW2 = `Faz4Bb2-${RUN}y`;

async function main() {
  if (PHASE === 'functional') await phaseFunctional();
  else if (PHASE === 'ratelimit') await phaseRatelimit();
  else if (PHASE === 'expiry') await phaseExpiry();
  else {
    console.error(`bilinmeyen faz: ${PHASE}`);
    process.exit(2);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n${PHASE}: ${passed}/${results.length} check geçti, ${failed} kaldı`);
  writeFileSync(`/tmp/faz4-probe-${PHASE}.json`, JSON.stringify(results, null, 2));
  appendFileSync('/tmp/faz4-secrets.txt', secrets.map(([t, v]) => `${t}\t${v}`).join('\n') + '\n');
  process.exit(failed === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
async function phaseFunctional() {
  const EMAIL = `faz4-main-${RUN}-${STAMP}@qa.local`;
  const EMAIL_B = `faz4-b-${RUN}-${STAMP}@qa.local`; // ikinci kullanıcı (sahiplik testi)

  // P01 — yeni kullanıcı kaydı + outbox'ta doğrulama e-postası
  const reg = await api('POST', '/auth/register', {
    body: { displayName: 'Faz4 Probe', email: EMAIL, password: PW1, locale: 'tr', acceptTerms: true },
  });
  secrets.push(['refresh', reg.body?.data?.tokens?.refreshToken ?? 'yok']);
  check(
    'P01 kayıt 201 + tokens + emailVerified:false + outbox doğrulama e-postası',
    reg.status === 201 &&
      reg.body?.data?.user?.emailVerified === false &&
      Boolean(reg.body?.data?.tokens?.accessToken) &&
      Boolean(reg.body?.data?.tokens?.refreshToken) &&
      lastTokenFor(EMAIL, 'VERIFY') !== null,
  );
  const mainUser = reg.body?.data;

  // P02 — doğrulanmamış e-posta ile giriş engellenir
  const locked = await api('POST', '/auth/login', { body: { email: EMAIL, password: PW1 } });
  check(
    'P02 doğrulanmamış giriş 403 EMAIL_NOT_VERIFIED',
    locked.status === 403 && reason(locked) === 'EMAIL_NOT_VERIFIED',
    `status:${locked.status}/${reason(locked)}`,
  );

  // P03 — doğrulanmamış kullanıcı: refresh reddedilir; kayıt-oturumu API_CONTRACT'taki
  // "göz atma penceresi" gereği GET /me dahil korumalı uçlara erişebilir (TTL dolana dek).
  const unvRefresh = await api('POST', '/auth/refresh', { body: { refreshToken: mainUser.tokens.refreshToken } });
  const unvMe = await api('GET', '/me', { token: mainUser.tokens.accessToken });
  check(
    'P03 doğrulanmamış: refresh 403 EMAIL_NOT_VERIFIED; GET /me kayıt-oturumuyla 200 (göz atma penceresi — API_CONTRACT)',
    unvRefresh.status === 403 && reason(unvRefresh) === 'EMAIL_NOT_VERIFIED' && unvMe.status === 200,
    `refresh:${unvRefresh.status}/${reason(unvRefresh)} me:${unvMe.status}`,
  );

  // P04 — e-posta doğrulama (outbox anahtarı) + anahtar tek kullanımlık
  const vToken = lastTokenFor(EMAIL, 'VERIFY');
  const verify = await api('POST', '/auth/verify-email', { body: { token: vToken } });
  const verifyAgain = await api('POST', '/auth/verify-email', { body: { token: vToken } });
  check(
    'P04 verify-email 201 + anahtar tek kullanımlık (2. kullanım 400 TOKEN_INVALID)',
    verify.status === 201 && verify.body?.data?.verified === true && verifyAgain.status === 400 && reason(verifyAgain) === 'TOKEN_INVALID',
    `verify:${verify.status} again:${verifyAgain.status}/${reason(verifyAgain)}`,
  );

  // P05 — doğrulama sonrası giriş
  const login = await api('POST', '/auth/login', { body: { email: EMAIL, password: PW1 } });
  secrets.push(['refresh', login.body?.data?.tokens?.refreshToken ?? 'yok']);
  const acc = login.body?.data?.tokens?.accessToken;
  const ref = login.body?.data?.tokens?.refreshToken;
  check('P05 doğru bilgilerle giriş 201 + emailVerified:true', login.status === 201 && login.body?.data?.user?.emailVerified === true);

  // P06 — aynı e-posta ile ikinci kayıt
  const dup = await api('POST', '/auth/register', {
    body: { displayName: 'Kopya', email: EMAIL, password: PW2, locale: 'tr', acceptTerms: true },
  });
  check('P06 tekrarlanan kayıt 409 EMAIL_ALREADY_EXISTS', dup.status === 409 && reason(dup) === 'EMAIL_ALREADY_EXISTS', `${dup.status}/${reason(dup)}`);

  // P07 — yanlış parola
  const bad = await api('POST', '/auth/login', { body: { email: EMAIL, password: `Yanlis${RUN}9` } });
  check('P07 yanlış parola 401 BAD_CREDENTIALS', bad.status === 401 && reason(bad) === 'BAD_CREDENTIALS', `${bad.status}/${reason(bad)}`);

  // P08 — profil görüntüleme + güncelleme
  const me = await api('GET', '/me', { token: acc });
  const patch = await api('PATCH', '/me', { token: acc, body: { displayName: 'Faz4 Güncel', locale: 'tr' } });
  const me2 = await api('GET', '/me', { token: acc });
  check(
    'P08 GET/PATCH /me: maskeli e-posta + güncelleme kalıcı',
    me.status === 200 && /\*+@/.test(me.body?.data?.maskedEmail ?? '') &&
      patch.status === 200 && me2.body?.data?.displayName === 'Faz4 Güncel',
    `me:${me.status} patch:${patch.status} name:${me2.body?.data?.displayName ?? '-'}`,
  );

  // P09 — avatar yükleme + statik yayın + kaldırma
  const form = new FormData();
  form.append('file', new Blob([PNG_1PX], { type: 'image/png' }), 'faz4.png');
  const up = await api('POST', '/me/avatar', { token: acc, form });
  const avatarUrl = up.body?.data?.avatarUrl;
  let servedOk = false;
  if (avatarUrl) {
    const served = await fetch(`http://localhost:3000${avatarUrl}`);
    servedOk = served.status === 200 && (served.headers.get('content-type') ?? '').includes('image/png');
  }
  const rm = await api('DELETE', '/me/avatar', { token: acc });
  check(
    'P09 avatar upload 201 + statik 200 image/png + DELETE sonrası null',
    up.status === 201 && /^\/uploads\/avatars\//.test(avatarUrl ?? '') && servedOk && rm.status === 200 && rm.body?.data?.avatarUrl === null,
    `up:${up.status} url:${avatarUrl ?? '-'} served:${servedOk} rm:${rm.status}`,
  );

  // P10 — oturum listesi
  const sessions = await api('GET', '/auth/sessions', { token: acc });
  check(
    'P10 oturum listesi: mevcut oturum current:true',
    sessions.status === 200 && (sessions.body?.data?.items?.length ?? 0) >= 1 && sessions.body.data.items.some((s) => s.current),
  );

  // P11 — ikinci oturum + tek oturum iptali + sahiplik denetimi
  const login2 = await api('POST', '/auth/login', { body: { email: EMAIL, password: PW1 } });
  const ref2 = login2.body?.data?.tokens?.refreshToken;
  secrets.push(['refresh', ref2 ?? 'yok']);
  const sessions2 = await api('GET', '/auth/sessions', { token: acc });
  const secondSession = sessions2.body?.data?.items?.find((s) => !s.current);
  const revoke = secondSession
    ? await api('DELETE', `/auth/sessions/${secondSession.id}`, { token: acc })
    : { status: 0, body: null };
  const ref2After = await api('POST', '/auth/refresh', { body: { refreshToken: ref2 } });
  // İkinci kullanıcı kur (sahiplik: başkasının oturumu silinemez)
  await api('POST', '/auth/register', {
    body: { displayName: 'Faz4 B', email: EMAIL_B, password: PW2, locale: 'tr', acceptTerms: true },
  });
  const vTokenB = lastTokenFor(EMAIL_B, 'VERIFY');
  await api('POST', '/auth/verify-email', { body: { token: vTokenB } });
  const loginB = await api('POST', '/auth/login', { body: { email: EMAIL_B, password: PW2 } });
  const accB = loginB.body?.data?.tokens?.accessToken;
  const sessB = await api('GET', '/auth/sessions', { token: accB });
  const foreignId = sessB.body?.data?.items?.[0]?.id;
  const foreignRevoke = foreignId
    ? await api('DELETE', `/auth/sessions/${foreignId}`, { token: acc })
    : { status: 0, body: null };
  check(
    'P11 ikinci oturum iptali → refresh 401; yabancı oturum silme → 404',
    login2.status === 201 && revoke.status === 200 && ref2After.status === 401 && foreignRevoke.status === 404,
    `revoke:${revoke.status} ref2After:${ref2After.status} foreign:${foreignRevoke.status}/${reason(foreignRevoke)}`,
  );

  // P12 — refresh rotasyonu + reuse detection (aile iptali)
  const rot = await api('POST', '/auth/refresh', { body: { refreshToken: ref } });
  const newRef = rot.body?.data?.tokens?.refreshToken;
  secrets.push(['refresh', newRef ?? 'yok']);
  const reuse = await api('POST', '/auth/refresh', { body: { refreshToken: ref } });
  const familyDead = await api('POST', '/auth/refresh', { body: { refreshToken: newRef } });
  check(
    'P12 rotasyon 201 + eski token reuse → 401 REFRESH_REUSED + ailedeki yeni token da ölü',
    rot.status === 201 && newRef !== ref && reuse.status === 401 && reason(reuse) === 'REFRESH_REUSED' && familyDead.status === 401,
    `rot:${rot.status} reuse:${reuse.status}/${reason(reuse)} family:${familyDead.status}/${reason(familyDead)}`,
  );

  // P13 — parola değiştirme: yanlış mevcut 400; doğru → diğer oturumlar kapanır, mevcut ayakta
  const fresh = await api('POST', '/auth/login', { body: { email: EMAIL, password: PW1 } });
  const accF = fresh.body?.data?.tokens?.accessToken;
  const refF = fresh.body?.data?.tokens?.refreshToken;
  const other = await api('POST', '/auth/login', { body: { email: EMAIL, password: PW1 } });
  const refO = other.body?.data?.tokens?.refreshToken;
  secrets.push(['refresh', refO ?? 'yok']);
  const wrongCur = await api('POST', '/auth/change-password', { token: accF, body: { currentPassword: 'Yanlis1x', newPassword: PW2 } });
  const changed = await api('POST', '/auth/change-password', { token: accF, body: { currentPassword: PW1, newPassword: PW2 } });
  const otherDead = await api('POST', '/auth/refresh', { body: { refreshToken: refO } });
  const meF = await api('GET', '/me', { token: accF });
  check(
    'P13 change-password: yanlış 400 WRONG_PASSWORD; doğru 201; diğer oturum 401; mevcut ayakta',
    wrongCur.status === 400 && reason(wrongCur) === 'WRONG_PASSWORD' && changed.status === 201 && otherDead.status === 401 && meF.status === 200,
    `wrong:${wrongCur.status}/${reason(wrongCur)} changed:${changed.status} other:${otherDead.status} me:${meF.status}`,
  );

  // P14 — parola sıfırlama: forgot → reset → eski parola 401, yeni parola 201, eski oturumlar kapandı
  const forgot = await api('POST', '/auth/forgot-password', { body: { email: EMAIL } });
  const rToken = lastTokenFor(EMAIL, 'RESET');
  const reset = rToken
    ? await api('POST', '/auth/reset-password', { body: { token: rToken, newPassword: PW1 } })
    : { status: 0, body: null };
  const oldPw = await api('POST', '/auth/login', { body: { email: EMAIL, password: PW2 } });
  const newPw = await api('POST', '/auth/login', { body: { email: EMAIL, password: PW1 } });
  secrets.push(['refresh', newPw.body?.data?.tokens?.refreshToken ?? 'yok']);
  const preResetDead = await api('POST', '/auth/refresh', { body: { refreshToken: refF } });
  check(
    'P14 forgot 201 + reset 201 + eski parola 401 + yeni parola 201 + reset öncesi oturum 401',
    forgot.status === 201 && reset.status === 201 && oldPw.status === 401 && newPw.status === 201 && preResetDead.status === 401,
    `forgot:${forgot.status} reset:${reset.status} oldPw:${oldPw.status}/${reason(oldPw)} newPw:${newPw.status} preResetRef:${preResetDead.status}`,
  );

  // P15 — süresi dolmuş e-posta anahtarı (DB'de TTL geçmişe çekilir)
  const forgot2 = await api('POST', '/auth/forgot-password', { body: { email: EMAIL } });
  const rToken2 = lastTokenFor(EMAIL, 'RESET');
  await dbExec('UPDATE email_tokens SET "expiresAt" = NOW() - INTERVAL \'1 minute\' WHERE "tokenHash" = $1', [sha256(rToken2 ?? '')]);
  const expiredReset = await api('POST', '/auth/reset-password', { body: { token: rToken2, newPassword: PW2 } });
  check(
    'P15 süresi dolmuş anahtar → 400 TOKEN_INVALID',
    forgot2.status === 201 && expiredReset.status === 400 && reason(expiredReset) === 'TOKEN_INVALID',
    `reset:${expiredReset.status}/${reason(expiredReset)}`,
  );

  // P16 — bozuk/garbage anahtarlar
  const garbageVerify = await api('POST', '/auth/verify-email', { body: { token: 'faz4-garbage-token-0001' } });
  const garbageReset = await api('POST', '/auth/reset-password', { body: { token: 'faz4-garbage-token-0002', newPassword: PW1 } });
  check(
    'P16 bozuk anahtar: verify 400 + reset 400 TOKEN_INVALID',
    garbageVerify.status === 400 && garbageReset.status === 400 && reason(garbageVerify) === 'TOKEN_INVALID',
    `verify:${garbageVerify.status}/${reason(garbageVerify)} reset:${garbageReset.status}/${reason(garbageReset)}`,
  );

  // P17 — yetkisiz profil güncelleme (token'sız + bozuk token)
  const noAuth = await api('PATCH', '/me', { body: { displayName: 'Sizma' } });
  const badAuth = await api('PATCH', '/me', { token: 'eyJhbGciOiJSUzI1NiJ9.faz4.bozuk', body: { displayName: 'Sizma' } });
  check(
    'P17 yetkisiz PATCH /me → 401 (token yok) + 401 (bozuk token)',
    noAuth.status === 401 && badAuth.status === 401,
    `no:${noAuth.status}/${reason(noAuth)} bad:${badAuth.status}/${reason(badAuth)}`,
  );

  // P18 — hesap silme akışı: yanlış parola 400 → talep 201 → giriş 401 → restore → oturum
  const delWrong = await api('POST', '/account/delete-request', { token: accF, body: { password: 'Yanlis1x' } });
  const del = await api('POST', '/account/delete-request', { token: accF, body: { password: PW1 } });
  const afterDel = await api('POST', '/auth/login', { body: { email: EMAIL, password: PW1 } });
  const restore = await api('POST', '/account/restore', { body: { email: EMAIL, password: PW1 } });
  secrets.push(['refresh', restore.body?.data?.tokens?.refreshToken ?? 'yok']);
  const meAfterRestore = await api('GET', '/me', { token: restore.body?.data?.tokens?.accessToken });
  check(
    'P18 hesap silme: yanlış parola 400 → talep 201+purgeAt → giriş 401 → restore 201 → /me 200',
    delWrong.status === 400 && del.status === 201 && Boolean(del.body?.data?.purgeAt) && afterDel.status === 401 && restore.status === 201 && meAfterRestore.status === 200,
    `delWrong:${delWrong.status} del:${del.status} login:${afterDel.status} restore:${restore.status} me:${meAfterRestore.status}`,
  );

  // P19 — yasal metinler
  const terms = await api('GET', '/legal/terms');
  const privacy = await api('GET', '/legal/privacy');
  const legal404 = await api('GET', '/legal/unknown-doc');
  check(
    'P19 legal: terms+privacy 200 Türkçe; bilinmeyen slug 404',
    terms.status === 200 && String(terms.body?.data?.title ?? '').includes('Kullanım') &&
      privacy.status === 200 && String(privacy.body?.data?.title ?? '').toLowerCase().includes('gizlilik') && legal404.status === 404,
    `terms:${terms.status} privacy:${privacy.status} 404:${legal404.status}`,
  );

  // P20 — DB güvence: refresh token yalnızca SHA-256 hash saklanır; IP hash/NULL
  const sessRows = await dbExec(
    'SELECT "refreshTokenHash", "ipHash" FROM sessions WHERE "userId" = $1 LIMIT 1',
    [mainUser.user.id],
  );
  const row = sessRows.rows[0];
  const hashOnly = Boolean(row) && /^[a-f0-9]{64}$/.test(row.refreshTokenHash);
  const noPlainInDb = Boolean(row) && !secrets.some(([, v]) => v && v.length > 10 && row.refreshTokenHash === v);
  const ipHashOk = Boolean(row) && (row.ipHash === null || /^[a-f0-9]{32}$/.test(row.ipHash));
  check(
    'P20 DB: refreshTokenHash 64-hex (düz metin değil, saklanan sırlarla eşleşmez), ipHash hash/NULL',
    hashOnly && noPlainInDb && ipHashOk,
  );

  // P21 — Swagger auth/account/legal uçlarını içeriyor
  const swagger = await fetch('http://localhost:3000/api/docs-json').then((r) => r.json()).catch(() => null);
  const paths = swagger?.paths ? Object.keys(swagger.paths) : [];
  const need = ['/auth/register', '/auth/login', '/auth/refresh', '/auth/verify-email', '/auth/forgot-password', '/auth/reset-password', '/auth/sessions', '/auth/logout-all', '/account/delete-request', '/account/restore', '/legal/terms'];
  // Swagger yolları global önekiyle (/api/v1/...) kayıtlı; her iki biçimi de kabul et.
  const missing = need.filter((p) => !paths.includes(p) && !paths.includes(`/api/v1${p}`));
  check('P21 Swagger auth/account/legal uçları tam', missing.length === 0, missing.length ? `eksik: ${missing.join(', ')}` : `${paths.length} yol`);
}

// ---------------------------------------------------------------------------
async function phaseRatelimit() {
  // Varsayılan limitler: login 5 / register 3 / reset 3 (pencere 60 sn, IP başına)
  const EMAIL = `faz4-rl-${RUN}-${STAMP}@qa.local`;

  // RL01 — login: 5 deneme 401, 6. 429
  let got429 = null;
  for (let i = 1; i <= 6; i++) {
    const r = await api('POST', '/auth/login', { body: { email: `nobody-${STAMP}@qa.local`, password: `Yanlis${i}x` } });
    if (r.status === 429) { got429 = r; break; }
  }
  const retryAfter = got429?.body?.error?.details?.retryAfterSeconds;
  check(
    'RL01 login rate limit: 6. deneme 429 + retryAfterSeconds',
    got429 !== null && reason(got429) === 'RATE_LIMIT_EXCEEDED' && Number(retryAfter) >= 1,
    got429 ? `reason:${reason(got429)} retryAfter:${retryAfter}` : '429 görülmedi',
  );

  // RL02 — register: ilk 3 kabul, 4. 429 (sonek yerel kısımda — geçerli e-posta)
  let reg429 = null;
  for (let i = 1; i <= 4; i++) {
    const r = await api('POST', '/auth/register', {
      body: { displayName: `RL ${i}`, email: `faz4-rl-${RUN}-${STAMP}-${i}@qa.local`, password: `Faz4Rl${i}x`, locale: 'tr', acceptTerms: true },
    });
    if (r.status === 429) { reg429 = r; break; }
  }
  check('RL02 register rate limit: 4. kayıt 429', reg429 !== null && reason(reg429) === 'RATE_LIMIT_EXCEEDED', reg429 ? '429 görüldü' : '429 görülmedi');

  // RL03 — forgot-password: 4. istek 429
  let reset429 = null;
  for (let i = 1; i <= 4; i++) {
    const r = await api('POST', '/auth/forgot-password', { body: { email: `rl-reset-${STAMP}@qa.local` } });
    if (r.status === 429) { reset429 = r; break; }
  }
  check('RL03 forgot-password rate limit: 4. istek 429', reset429 !== null && reason(reset429) === 'RATE_LIMIT_EXCEEDED', reset429 ? '429 görüldü' : '429 görülmedi');
}

// ---------------------------------------------------------------------------
async function phaseExpiry() {
  const EMAIL = `faz4-exp-${RUN}-${STAMP}@qa.local`;
  // E01 — kurulum: kayıt + doğrulama + giriş + /me 200
  const reg = await api('POST', '/auth/register', {
    body: { displayName: 'Faz4 Expiry', email: EMAIL, password: PW1, locale: 'tr', acceptTerms: true },
  });
  const vToken = lastTokenFor(EMAIL, 'VERIFY');
  await api('POST', '/auth/verify-email', { body: { token: vToken } });
  const login = await api('POST', '/auth/login', { body: { email: EMAIL, password: PW1 } });
  const acc = login.body?.data?.tokens?.accessToken;
  const ref = login.body?.data?.tokens?.refreshToken;
  secrets.push(['refresh', ref ?? 'yok']);
  const meNow = await api('GET', '/me', { token: acc });
  check('E01 kurulum: kayıt+doğrulama+giriş+GET /me 200', reg.status === 201 && login.status === 201 && meNow.status === 200, `reg:${reg.status} login:${login.status} me:${meNow.status}`);

  // E02 — access TTL (60sn) dolana dek bekle
  console.log('   … access token TTL (60sn) dolması bekleniyor');
  await new Promise((r) => setTimeout(r, 63_000));

  const meExpired = await api('GET', '/me', { token: acc });
  check(
    'E02 süresi dolmuş access token → 401 TOKEN_EXPIRED',
    meExpired.status === 401 && reason(meExpired) === 'TOKEN_EXPIRED',
    `${meExpired.status}/${reason(meExpired)}`,
  );

  // E03 — oturum yenileme: refresh 201 + yeni access ile /me 200
  // (mobil api-client'ın 401→otomatik refresh akışının sunucu karşılığı)
  const rot = await api('POST', '/auth/refresh', { body: { refreshToken: ref } });
  const newAcc = rot.body?.data?.tokens?.accessToken;
  secrets.push(['refresh', rot.body?.data?.tokens?.refreshToken ?? 'yok']);
  const meNew = await api('GET', '/me', { token: newAcc });
  check(
    'E03 oturum yenilenir: refresh 201 + yeni access ile /me 200',
    rot.status === 201 && meNew.status === 200,
    `rot:${rot.status} me:${meNew.status}`,
  );
}

main().catch((e) => {
  console.error('PROBE HATASI:', e);
  process.exit(3);
});
