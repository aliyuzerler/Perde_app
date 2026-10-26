#!/usr/bin/env node
/**
 * FAZ 10 güvenlik probe'u — mağaza öncesi sertleştirme kabulü.
 *
 * Fazlar (PROBE_PHASE ile seçilir; runner ayrı sunucu env'leriyle koşar):
 *   A — auth/RBAC, veri izolasyonu, webhook replay, eşzamanlı unlock,
 *       yetersiz kredi, süresi dolmuş abonelik, playback token,
 *       kötü niyetli istekler, debug yüzeyi, güvenlik başlıkları, performans.
 *   B — RevenueCat webhook güvenliği (Bearer, replay/idempotency, fail-closed).
 *   C — hız sınırları (VARSAYILAN limitlerle: login 5, register 3, reset 3,
 *       step-up 5 / pencere).
 *
 * Dürüstlük kuralları: her kontrol gerçek HTTP + gerçek PostgreSQL ile;
 * sahte başarı yok; sections birbiriyle deterministik (stamp'li veri).
 */
const API = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3197/api/v1';
const PHASE = process.env.PROBE_PHASE ?? 'A';
const DB_URL = process.env.PROBE_DB_URL ?? 'postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego?schema=public';
const HMAC_SECRET = process.env.HMAC_SECRET ?? 'faz10-qa-imza-sirri-0123456789';
const RC_SECRET = process.env.RC_WEBHOOK_SECRET ?? 'faz10-qa-rc-webhook-sirri-012345678';
const { createHmac, randomUUID } = await import('node:crypto');

let pass = 0;
let fail = 0;
const failures = [];
const section = (t) => console.log(`\n──── ${t} ────`);
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

async function req(method, path, { token, stepUp, body, raw, headers = {} } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (stepUp) h['x-step-up-token'] = stepUp;
  if (body !== undefined) h['content-type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ham gövde */ }
  return { status: res.status, json, text, headers: res.headers };
}
const data = (r) => r.json?.data;
const okS = (s) => s === 200 || s === 201 || s === 202;
const reasonOf = (r) => r.json?.error?.details?.reason ?? r.json?.error?.code ?? '(yok)';

async function login(email, password) {
  const r = await req('POST', '/auth/login', { body: { email, password } });
  if (!okS(r.status) || !data(r)?.tokens) throw new Error(`login ${email} → ${r.status}`);
  const d = data(r);
  return { token: d.tokens.accessToken, accessToken: d.tokens.accessToken, refreshToken: d.tokens.refreshToken, user: d.user };
}
async function register(name) {
  const email = `faz10-${name}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}@perdego.test`;
  const r = await req('POST', '/auth/register', { body: { displayName: `Faz10 ${name}`, email, password: 'Qa123456' } });
  if (r.status !== 201 || !data(r)?.tokens) throw new Error(`register ${name} → ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  return { email, password: 'Qa123456', token: data(r).tokens.accessToken, userId: data(r).user.id };
}

let dbClient = null;
async function q(sql, params = []) {
  if (!dbClient) {
    const { Client } = await import('pg');
    dbClient = new Client({ connectionString: DB_URL });
    await dbClient.connect();
  }
  return (await dbClient.query(sql, params)).rows;
}
const hmacSig = (raw) => createHmac('sha256', HMAC_SECRET).update(raw).digest('hex');
const playbackToken = (sessionId, episodeId, exp) =>
  createHmac('sha256', HMAC_SECRET).update(`playback:${sessionId}:${episodeId}:${exp}`).digest('hex').slice(0, 32);

const stamp = Date.now().toString(36);
const S = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findEpisodes() {
  const rows = await q(
    `SELECT e.id, e."accessType", e."creditCost", c.slug, e."seasonNumber", e."episodeNumber"
       FROM episodes e JOIN contents c ON c.id = e."contentId"
      WHERE c.slug IN ('kayip-sinyal','gizli-bahce','sessiz-sehir','yanki')
      ORDER BY c.slug, e."seasonNumber", e."episodeNumber"`);
  return rows;
}

async function createQa10Content(admin) {
  const series = await req('POST', '/admin/titles', {
    token: admin.accessToken,
    body: { kind: 'SERIES', seriesFormat: 'MINI', titleTr: `QA10 Güvenlik ${stamp}`, titleEn: `QA10 Security ${stamp}`, synopsisTr: 'QA', synopsisEn: 'QA', releaseYear: 2026, slug: `qa10-sec-${stamp}` },
  });
  if (!okS(series.status)) throw new Error(`qa10 content oluşturulamadı: ${series.status} ${JSON.stringify(series.json).slice(0, 200)}`);
  const contentId = data(series).id;
  await req('POST', `/admin/titles/${contentId}/seasons`, { token: admin.accessToken, body: { seasonNumber: 1 } });
  const eps = {};
  for (const [no, access, cost] of [[1, 'FREE', null], [2, 'CREDIT', 2], [3, 'CREDIT', 2]]) {
    const body = { seasonNumber: 1, episodeNumber: no, titleTr: `QA10 B${no}`, titleEn: `QA10 E${no}`, durationSeconds: 60, accessType: access };
    if (cost) body.creditCost = cost;
    const er = await req('POST', `/admin/titles/${contentId}/episodes`, { token: admin.accessToken, body });
    if (!okS(er.status)) throw new Error(`qa10 bölüm ${no}: ${er.status}`);
    eps[no] = data(er).id;
    await req('PATCH', `/admin/episodes/${eps[no]}/status`, { token: admin.accessToken, body: { status: 'PUBLISHED' } });
  }
  await req('PATCH', `/admin/titles/${contentId}/status`, { token: admin.accessToken, body: { status: 'PUBLISHED' } });
  return { contentId, eps };
}

async function grantCreditsHmac(user, packCode, txId) {
  const body = { source: 'REVENUECAT', eventId: txId, eventType: 'CREDIT_PACK_PURCHASED', payload: { userId: user.userId, userEmail: user.email, productId: packCode, platform: 'IOS', storeTransactionId: txId } };
  const raw = JSON.stringify(body);
  return req('POST', '/billing/webhooks', { headers: { 'X-PerdeGo-Signature': hmacSig(raw), 'content-type': 'application/json' }, raw });
}

// ===========================================================================
// FAZ A
// ===========================================================================
async function phaseA() {
  section('S0 — Ortam ve tohum hesaplar');
  const health = await fetch(`${API.replace('/api/v1', '')}/health`);
  ok('A0.1 API ayakta', health.ok);
  // Önceki koşum kalıntısı oturumlar paralel oynatma limitini (2) doldurabilir — temizle.
  await q(`DELETE FROM playback_sessions`).catch(() => undefined);
  S.admin = await login('admin@perdego.dev', 'Admin12345');
  S.editor = await login('editor@perdego.dev', 'Admin12345');
  S.viewer = await login('viewer@perdego.dev', 'Dev12345');
  ok('A0.2 admin/editor/viewer girişleri', Boolean(S.admin.token && S.editor.token && S.viewer.token));
  const eps = await findEpisodes();
  S.eps = eps;
  const creditEps = eps.filter((e) => e.accessType === 'CREDIT');
  ok('A0.3 kredili bölümler mevcut', creditEps.length >= 3, `n=${creditEps.length}`);

  section('S1 — Kimlik doğrulama ve RBAC');
  const anonWallet = await req('GET', '/credits/wallet');
  ok('A1.1 anonim /credits/wallet → 401', anonWallet.status === 401, `=${anonWallet.status}`);
  const anonDash = await req('GET', '/admin/dashboard');
  ok('A1.2 anonim /admin/dashboard → 401', anonDash.status === 401, `=${anonDash.status}`);
  const viewerDash = await req('GET', '/admin/dashboard', { token: S.viewer.token });
  ok('A1.3 USER → /admin/dashboard 403', viewerDash.status === 403, `=${viewerDash.status} ${reasonOf(viewerDash)}`);
  const planRows = await q(`SELECT id FROM plans WHERE code='SUB_MONTHLY' LIMIT 1`);
  const planId = planRows[0]?.id;
  const editorPlan = await req('PATCH', `/admin/plans/${planId}`, { token: S.editor.token, stepUp: 'sahte-adim', body: { priceKurus: 4990 } });
  ok('A1.4 EDITOR finansal yazma → reddedilir', editorPlan.status === 401 || editorPlan.status === 403, `=${editorPlan.status} ${reasonOf(editorPlan)}`);
  const userRole = await register('role');
  const userRolePatch = await req('PATCH', `/admin/users/${userRole.userId}/role`, { token: userRole.token, body: { role: 'ADMIN' } });
  ok('A1.5 USER kendi rolünü yükseltemez → 403', userRolePatch.status === 403, `=${userRolePatch.status}`);
  const suWrong = await req('POST', '/auth/step-up', { token: userRole.token, body: { password: 'YanlisParola1' } });
  ok('A1.6 step-up yanlış parola → 401', suWrong.status === 401, `=${suWrong.status}`);
  const adminSu = await req('POST', '/auth/step-up', { token: S.admin.accessToken, body: { password: 'Admin12345' } });
  S.step = data(adminSu)?.stepUpToken;
  ok('A1.7 admin step-up token verir', Boolean(S.step));
  const foreignSu = await req('PATCH', `/admin/plans/${planId}`, { token: S.editor.token, stepUp: S.step, body: { priceKurus: 4990 } });
  ok('A1.8 yabancı step-up tokenı → 403', foreignSu.status === 403, `=${foreignSu.status} ${reasonOf(foreignSu)}`);

  section('S2 — Kullanıcılar arası veri izolasyonu');
  const A = await register('iso-a');
  const B = await register('iso-b');
  const favTarget = await q(`SELECT id FROM contents WHERE slug='gizli-bahce' LIMIT 1`);
  const favAdd = await req('POST', `/watchlist/${favTarget[0].id}`, { token: A.token });
  ok('A2.1 A listesine içerik ekler', okS(favAdd.status), `=${favAdd.status}`);
  const listA = await req('GET', '/watchlist', { token: A.token });
  const listB = await req('GET', '/watchlist', { token: B.token });
  const itemsA = JSON.stringify(data(listA) ?? {});
  const itemsB = JSON.stringify(data(listB) ?? {});
  ok('A2.2 A listesinde içerik var', itemsA.includes(favTarget[0].id));
  ok('A2.3 B listesinde A içeriği YOK', !itemsB.includes(favTarget[0].id));
  const devA = await req('POST', '/notifications/devices', { token: A.token, body: { platform: 'IOS', pushToken: `ExponentPushToken[qa10-iso-${stamp}]`, locale: 'tr' } });
  ok('A2.4 A cihaz kaydeder', okS(devA.status), `=${devA.status}`);
  const leak = await q(`SELECT COUNT(*)::int AS n FROM devices WHERE "userId"=$1 AND "pushToken"=$2`, [B.userId, `ExponentPushToken[qa10-iso-${stamp}]`]);
  ok('A2.5 B hesabında A tokenı YOK (DB)', leak[0].n === 0, `n=${leak[0].n}`);
  const sessB = await req('GET', '/auth/sessions', { token: B.token });
  const sessCount = data(sessB)?.items?.length ?? -1;
  ok('A2.6 B yalnız kendi oturumunu görür (1)', sessCount === 1, `=${sessCount}`);
  const notifB = await q(`SELECT COUNT(*)::int AS n FROM notifications WHERE "userId"=$1`, [B.userId]);
  ok('A2.7 B bildirim kuyruğu boş', notifB[0].n === 0, `n=${notifB[0].n}`);
  const progB = await req('GET', '/watch-progress', { token: B.token });
  const progBEmpty = (data(progB)?.items ?? data(progB) ?? []).length === 0;
  ok('A2.8 B izleme geçmişi boş', progBEmpty);

  section('S3 — Ödeme webhook replay (genel zarf, HMAC)');
  const C = await register('webhook');
  const badSig = await req('POST', '/billing/webhooks', { headers: { 'X-PerdeGo-Signature': '0'.repeat(64) }, body: { source: 'REVENUECAT', eventId: `qa10-bad-${stamp}`, eventType: 'CREDIT_PACK_PURCHASED' } });
  ok('A3.1 hatalı imza → 202 SKIPPED (işlenmez)', badSig.status === 202 && data(badSig)?.state === 'SKIPPED', `=${badSig.status} ${data(badSig)?.state}`);
  const tx1 = `qa10_tx_${stamp}_1`;
  const wh1 = await grantCreditsHmac(C, 'PACK_10', tx1);
  ok('A3.2 kredi webhook 202/PROCESSED', okS(wh1.status) && data(wh1)?.state === 'PROCESSED', `=${wh1.status} ${data(wh1)?.state}`);
  const w1 = await req('GET', '/credits/wallet', { token: C.token });
  ok('A3.3 cüzdan +10', data(w1)?.wallet?.creditBalance === 10, `=${data(w1)?.wallet?.creditBalance}`);
  const wh2 = await grantCreditsHmac(C, 'PACK_10', tx1);
  ok('A3.4 replay duplicate=true', data(wh2)?.duplicate === true, `=${JSON.stringify(data(wh2))}`);
  const w2 = await req('GET', '/credits/wallet', { token: C.token });
  ok('A3.5 replay sonrası bakiye hâlâ 10', data(w2)?.wallet?.creditBalance === 10, `=${data(w2)?.wallet?.creditBalance}`);
  const ledgerCount = await q(`SELECT COUNT(*)::int AS n FROM credit_ledger WHERE "userId"=$1 AND delta > 0`, [C.userId]);
  ok('A3.6 ledger tek PURCHASE kaydı', ledgerCount[0].n === 1, `n=${ledgerCount[0].n}`);

  section('S4 — Eşzamanlı bölüm açma yarışı (tek bakiye, iki istek)');
  const D = await register('race');
  await grantCreditsHmac(D, 'PACK_10', `qa10_tx_${stamp}_race`);
  const cost4 = S.eps.find((e) => e.slug === 'sessiz-sehir' && e.creditCost === 4);
  const cost3 = S.eps.find((e) => e.slug === 'gizli-bahce' && e.creditCost === 3);
  const u1 = await req('POST', `/credits/unlock/${cost4.id}`, { token: D.token, body: {} });
  ok('A4.1 4 kredilik bölüm açılır', okS(u1.status), `=${u1.status} ${reasonOf(u1)}`);
  const u2 = await req('POST', `/credits/unlock/${cost3.id}`, { token: D.token, body: {} });
  ok('A4.2 3 kredilik bölüm açılır (bakiye 3)', okS(u2.status), `=${u2.status} ${reasonOf(u2)}`);
  const qa10 = await createQa10Content(S.admin);
  S.qa10 = qa10;
  const raceEp = qa10.eps[3];
  const [r1, r2] = await Promise.all([
    req('POST', `/credits/unlock/${raceEp}`, { token: D.token, body: {} }),
    req('POST', `/credits/unlock/${raceEp}`, { token: D.token, body: {} }),
  ]);
  const winCount = [r1, r2].filter((r) => okS(r.status)).length;
  const fail402 = [r1, r2].filter((r) => r.status === 402).length;
  ok('A4.3 yarış: tam bir 2xx + bir 402', winCount === 1 && fail402 === 1, `=${r1.status}/${r2.status}`);
  const walletAfter = await req('GET', '/credits/wallet', { token: D.token });
  ok('A4.4 bakiye tam 1 düştü (3→1)', data(walletAfter)?.wallet?.creditBalance === 1, `=${data(walletAfter)?.wallet?.creditBalance}`);
  const unlockRows = await q(`SELECT COUNT(*)::int AS n FROM episode_unlocks WHERE "userId"=$1 AND "episodeId"=$2`, [D.userId, raceEp]);
  ok('A4.5 tek unlock satırı', unlockRows[0].n === 1, `n=${unlockRows[0].n}`);
  const negWallet = await q(`SELECT "purchasedBalance","grantedBalance" FROM credit_wallets WHERE "userId"=$1`, [D.userId]);
  ok('A4.6 cüzdan negatif değil', negWallet.length === 1 && negWallet[0].purchasedBalance >= 0 && negWallet[0].grantedBalance >= 0, JSON.stringify(negWallet[0]));

  section('S5 — Yetersiz kredi');
  const E = await register('poor');
  const noCredits = await req('POST', `/credits/unlock/${raceEp}`, { token: E.token, body: {} });
  ok('A5.1 bakiyesiz unlock → 402 INSUFFICIENT_CREDITS', noCredits.status === 402 && reasonOf(noCredits) === 'INSUFFICIENT_CREDITS', `=${noCredits.status} ${reasonOf(noCredits)}`);
  const poorRows = await q(`SELECT COUNT(*)::int AS n FROM episode_unlocks WHERE "userId"=$1 AND "episodeId"=$2`, [E.userId, raceEp]);
  ok('A5.2 unlock satırı YOK', poorRows[0].n === 0, `n=${poorRows[0].n}`);

  section('S6 — Geçersiz/süresi dolmuş abonelikle premium erişim');
  const subRows = await q(
    `SELECT e.id FROM episodes e
       JOIN contents c ON c.id = e."contentId"
       JOIN episode_media m ON m."episodeId" = e.id AND m.state = 'READY'
      WHERE c.status='PUBLISHED' AND e.status='PUBLISHED' AND e."accessType"='SUBSCRIPTION'
      LIMIT 1`);
  if (subRows.length === 0) {
    ok('A6.0 abonelikli+medya hazır bölüm var', false, 'seed verisi yok — S6 koşulamadı');
  } else {
    const subEp = subRows[0].id;
    const F = await register('nosub');
    const deny = await req('POST', `/media/playback/${subEp}/session`, { token: F.token });
    ok('A6.1 aboneliksiz premium session → 402 NEEDS_SUBSCRIPTION', deny.status === 402 && reasonOf(deny) === 'NEEDS_SUBSCRIPTION', `=${deny.status} ${reasonOf(deny)}`);
    await q(
      `INSERT INTO subscriptions (id, "userId", "planId", platform, status, "autoRenew", "currentPeriodStart", "currentPeriodEnd", "productId", "updatedAt")
       VALUES ($1, $2, (SELECT id FROM plans WHERE code='SUB_MONTHLY'), 'IOS', 'ACTIVE', false, now() - interval '40 days', now() - interval '10 days', 'SUB_MONTHLY', now())`,
      [`qa10sub_${stamp}_${Math.floor(Math.random() * 1e9)}`, F.userId]);
    const denyExpired = await req('POST', `/media/playback/${subEp}/session`, { token: F.token });
    ok('A6.2 SÜRESİ DOLMUŞ ACTIVE abonelik yine 402', denyExpired.status === 402, `=${denyExpired.status} ${reasonOf(denyExpired)}`);
    const viewerOk = await req('POST', `/media/playback/${subEp}/session`, { token: S.viewer.token });
    ok('A6.3 pozitif kontrol: viewer (aktif abone) → oturum açılır', okS(viewerOk.status) && Boolean(data(viewerOk)?.playbackUrl), `=${viewerOk.status}`);
  }

  section('S7 — Playback token: imza, süre, iptal');
  const freeRows = await q(
    `SELECT e.id FROM episodes e
       JOIN contents c ON c.id = e."contentId"
       JOIN episode_media m ON m."episodeId" = e.id AND m.state = 'READY'
      WHERE c.status='PUBLISHED' AND e.status='PUBLISHED' AND e."accessType"='FREE'
      LIMIT 1`);
  if (freeRows.length === 0) {
    ok('A7.0 FREE+medya hazır bölüm var', false, 'seed verisi yok — S7 koşulamadı');
  } else {
    const freeEp = freeRows[0].id;
    const sess = await req('POST', `/media/playback/${freeEp}/session`, { token: S.viewer.token });
    ok('A7.1 FREE session açılır', okS(sess.status), `=${sess.status}`);
    const playbackUrl = data(sess)?.playbackUrl ?? '';
    if (!playbackUrl) {
      ok('A7.2 playbackUrl üretildi', false, `yanıt: ${JSON.stringify(data(sess)).slice(0, 120)}`);
      return;
    }
    const parsed = new URL(playbackUrl);
    // URL deseni: /api/v1/media/hls/:episodeId/:sessionId/master.m3u8 → sessionId sondan ikinci segment.
    const segs = parsed.pathname.split('/').filter(Boolean);
    const sessionId = decodeURIComponent(segs[segs.length - 2] ?? '');
    const manifest = await fetch(playbackUrl);
    ok('A7.2 imzalı manifest 200', manifest.status === 200, `=${manifest.status}`);
    const tampered = playbackUrl.replace(/token=[0-9a-f]/, (m) => m.slice(0, -1) + (m.endsWith('0') ? '1' : '0'));
    const tamperedRes = await fetch(tampered);
    ok('A7.3 bozuk imza → 403 TOKEN_INVALID', tamperedRes.status === 403, `=${tamperedRes.status}`);
    const pastExp = Math.floor(Date.now() / 1000) - 120;
    const expiredUrl = `${parsed.origin}${parsed.pathname}?token=${playbackToken(sessionId, freeEp, pastExp)}&exp=${pastExp}`;
    const expiredRes = await fetch(expiredUrl);
    ok('A7.4 süresi dolmuş token → 403', expiredRes.status === 403, `=${expiredRes.status}`);
    const revokedRows = await q(`UPDATE playback_sessions SET "revokedAt"=now() WHERE id=$1 RETURNING id`, [sessionId]);
    ok('A7.5a oturum satırı bulundu ve iptal edildi', revokedRows.length === 1, `n=${revokedRows.length} sid=${sessionId.slice(0, 8)}`);
    const revokedRes = await fetch(playbackUrl);
    ok('A7.5 iptal edilmiş oturum → 403 (anında kesilir)', revokedRes.status === 403, `=${revokedRes.status}`);
  }

  section('S8 — Hatalı / kötü niyetli istekler');
  const sqli = await req('GET', `/search?query=${encodeURIComponent("'; DROP TABLE contents;--")}`);
  const tableCount = await q(`SELECT COUNT(*)::int AS n FROM contents`);
  ok('A8.1 SQLi deseni → 200 (parametrik sorgu, çökmez) ve tablo sağlam', sqli.status === 200 && tableCount[0].n > 0, `=${sqli.status} n=${tableCount[0].n}`);
  const xss = await req('GET', `/search?query=${encodeURIComponent('<script>alert(1)</script>')}`);
  ok('A8.2 XSS deseni → 200/400 (çökmez)', (xss.status === 200 || xss.status === 400) && xss.status < 500, `=${xss.status}`);
  const badJson = await req('POST', '/auth/login', { raw: '{"email": "kırık' });
  ok('A8.3 bozuk JSON → 400', badJson.status === 400, `=${badJson.status}`);
  const wrongType = await req('POST', '/auth/register', { body: { displayName: 42, email: 'not-an-email', password: 123 } });
  ok('A8.4 yanlış tipler → 400 VALIDATION_FAILED', wrongType.status === 400 && reasonOf(wrongType) === 'VALIDATION_FAILED', `=${wrongType.status} ${reasonOf(wrongType)}`);
  const bigBody = 'x'.repeat(1_200_000);
  const oversized = await req('POST', '/auth/login', { raw: `{"email":"${bigBody}","password":"X12345678"}` });
  ok('A8.5 1.2MB gövde reddedilir → 400/413', oversized.status === 400 || oversized.status === 413, `=${oversized.status}`);
  const traversal = await fetch(`${API.replace('/api/v1', '')}/uploads/../.env`);
  const travText = await traversal.text();
  ok('A8.6 path traversal → env sızmaz', traversal.status !== 200 && !travText.includes('DATABASE_URL'), `=${traversal.status}`);
  const trav2 = await fetch(`${API}/media/hls/..%2F..%2F..%2Fetc%2Fpasswd/x.m3u8?token=abc&exp=1`);
  ok('A8.7 medya yol gezinmesi → 4xx', trav2.status >= 400 && trav2.status < 500, `=${trav2.status}`);
  const unknown = await req('GET', '/__yok_boyle_uci__');
  ok('A8.8 bilinmeyen uç → 404 zarfı', unknown.status === 404 && unknown.json?.ok === false, `=${unknown.status}`);
  const noneJwt = await req('GET', '/credits/wallet', { token: `${randomUUID()}.${btoa(JSON.stringify({ alg: 'none' }))}.` });
  ok('A8.9 alg=none JWT → 401', noneJwt.status === 401, `=${noneJwt.status}`);

  section('S9 — Debug / sahte ödeme yüzeyleri');
  // BILLING_PROVIDER=none + NODE_ENV=test → dev simülasyon sağlayıcısı devrededir
  // (geliştirme sözleşmesi). Üretimde C-07 kanıtı: configured=false + verifyPurchase
  // throw → sahte başarı üretilemez. A9.2: sağlayıcı yokken RC webhook 503 fail-closed.
  const validateFake = await req('POST', '/billing/purchases/validate', { token: C.token, headers: { 'Idempotency-Key': `qa10-fc-${stamp}` }, body: { platform: 'IOS', productType: 'CREDIT_PACK', productId: 'perdego.pack.pack_10', storeTransactionId: `qa10_fake_${stamp}` } });
  ok('A9.1 dev simülasyon yalnız test ortamında doğrular (üretimde C-07 throw)', validateFake.status === 201 || validateFake.status === 200, `=${validateFake.status}`);
  const rcNone = await req('POST', '/billing/webhooks/revenuecat', { headers: { authorization: 'Bearer test' }, body: { event: { type: 'TEST', id: `qa10-rc-${stamp}` } } });
  ok('A9.2 sağlayıcı yokken RC webhook → 503', rcNone.status === 503, `=${rcNone.status}`);
  const debugEp = await req('GET', '/debug/echo');
  ok('A9.3 /debug ucu yok (404)', debugEp.status === 404, `=${debugEp.status}`);
  const docsDev = await fetch(`${API.replace('/api/v1', '')}/api/docs`);
  ok('A9.4 geliştirme/test ortamında Swagger açık (bilinçli)', docsDev.status === 200, `=${docsDev.status} (üretimde kapalı — bootstrap.spec kanıtı)`);

  section('S10 — Güvenlik başlıkları');
  const hRes = await fetch(`${API.replace('/api/v1', '')}/health`);
  ok('A10.1 X-Content-Type-Options: nosniff', hRes.headers.get('x-content-type-options') === 'nosniff', `=${hRes.headers.get('x-content-type-options')}`);
  ok('A10.2 X-Frame-Options: DENY', hRes.headers.get('x-frame-options') === 'DENY');
  ok('A10.3 Referrer-Policy: no-referrer', hRes.headers.get('referrer-policy') === 'no-referrer');
  ok('A10.4 HSTS test ortamında yok (üretimde var)', hRes.headers.get('strict-transport-security') === null);

  section('S13 — Performans (sentetik büyük katalog)');
  await q(`DELETE FROM watch_history WHERE "episodeId" IN (SELECT id FROM episodes WHERE "contentId" IN (SELECT id FROM contents WHERE slug LIKE 'qa10perf-%'))`);
  await q(`DELETE FROM episodes WHERE "contentId" IN (SELECT id FROM contents WHERE slug LIKE 'qa10perf-%')`);
  await q(`DELETE FROM seasons WHERE "contentId" IN (SELECT id FROM contents WHERE slug LIKE 'qa10perf-%')`);
  await q(`DELETE FROM contents WHERE slug LIKE 'qa10perf-%'`);
  const t0 = Date.now();
  await q(
    `INSERT INTO contents (id, slug, kind, "seriesFormat", "titleTr", "titleEn", "synopsisTr", "synopsisEn", "releaseYear", "accessType", status, "publishedAt", "updatedAt")
     SELECT 'qa10perf-'||g, 'qa10perf-'||g, 'SERIES', 'MINI', 'QA10 Perf '||g, 'QA10 Perf '||g, 'perf', 'perf', 2026, 'FREE', 'PUBLISHED', now() - (g || ' minutes')::interval, now()
     FROM generate_series(1, 2000) g`);
  await q(
    `INSERT INTO seasons (id, "contentId", "seasonNumber", "titleTr", "updatedAt")
     SELECT 'qa10perf-s-'||g, 'qa10perf-'||g, 1, 'S1', now()
     FROM generate_series(1, 2000) g`);
  await q(
    `INSERT INTO episodes (id, "contentId", "seasonNumber", "episodeNumber", "titleTr", "titleEn", "durationSeconds", "accessType", status, "publishedAt", "updatedAt")
     SELECT 'qa10perf-e-'||g||'-'||k, 'qa10perf-'||g, 1, k, 'Bölüm '||k, 'Ep '||k, 60, 'FREE', 'PUBLISHED', now(), now()
     FROM generate_series(1, 2000) g, generate_series(1, 4) k`);
  const seedMs = Date.now() - t0;
  console.log(`  (sentetik katalog kuruldu: 2000 yapım / 8000 bölüm, ${seedMs}ms)`);

  const timeIt = async (label, url, runs = 5, token) => {
    const times = [];
    let lastStatus = 0;
    for (let i = 0; i < runs; i++) {
      const t = Date.now();
      const r = await fetch(url, token ? { headers: { authorization: `Bearer ${token}` } } : undefined);
      lastStatus = r.status;
      await r.text();
      times.push(Date.now() - t);
    }
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const max = Math.max(...times);
    console.log(`  ${label}: ort=${avg}ms max=${max}ms status=${lastStatus}`);
    return { avg, max, status: lastStatus };
  };
  const base = API.replace('/api/v1', '');
  const p1 = await timeIt('katalog sayfa 1', `${base}/api/v1/catalog/titles?page=1&pageSize=20`);
  ok('A13.1 katalog sayfa 1 ort < 300ms', p1.status === 200 && p1.avg < 300, `avg=${p1.avg} status=${p1.status}`);
  const pDeep = await timeIt('katalog derin sayfa 50', `${base}/api/v1/catalog/titles?page=50&pageSize=20`);
  ok('A13.2 derin sayfa ort < 300ms', pDeep.status === 200 && pDeep.avg < 300, `avg=${pDeep.avg}`);
  const pSearch = await timeIt('arama (qa10perf)', `${base}/api/v1/search?query=qa10perf&page=1`);
  ok('A13.3 arama ort < 300ms', pSearch.status === 200 && pSearch.avg < 300, `avg=${pSearch.avg}`);
  await q(
    `INSERT INTO watch_history (id, "userId", "episodeId", "contentId", "positionSeconds", completed, "lastWatchedAt")
     SELECT 'qa10perf-wh-'||g, $1, 'qa10perf-e-'||((g % 2000) + 1)||'-1', 'qa10perf-'||((g % 2000) + 1), 30, false, now() - (g || ' minutes')::interval
     FROM generate_series(1, 300) g
     ON CONFLICT ("userId", "episodeId") DO NOTHING`, [D.userId]);
  const pContinue = await timeIt('devam et (300 satır kullanıcı)', `${base}/api/v1/watch-progress?scope=continue&page=1&pageSize=20`, 5, D.token);
  ok('A13.4 devam et ort < 300ms', pContinue.status === 200 && pContinue.avg < 300, `avg=${pContinue.avg} status=${pContinue.status}`);
  const plan = await q(`EXPLAIN SELECT * FROM contents WHERE status='PUBLISHED' ORDER BY "publishedAt" DESC LIMIT 20`);
  const planText = plan.map((r) => Object.values(r)[0]).join(' ');
  ok('A13.5 yayın listesi indeks kullanıyor (status,publishedAt DESC)', /Index\s+Scan|Bitmap/i.test(planText) && planText.includes('contents_status_publishedAt_idx'), planText.slice(0, 140));

  // Sentetik veri temizliği (katalog sıralamasını kirletmesin)
  await q(`DELETE FROM watch_history WHERE "userId"=$1 AND "episodeId" LIKE 'qa10perf-%'`, [D.userId]);
  await q(`DELETE FROM episodes WHERE "contentId" LIKE 'qa10perf-%'`);
  await q(`DELETE FROM seasons WHERE "contentId" LIKE 'qa10perf-%'`);
  await q(`DELETE FROM contents WHERE id LIKE 'qa10perf-%'`);
  const leftover = await q(`SELECT COUNT(*)::int AS n FROM contents WHERE slug LIKE 'qa10perf-%'`);
  ok('A13.6 sentetik veri temizlendi', leftover[0].n === 0, `n=${leftover[0].n}`);

  section('S14 — QA verisi temizliği (qa10-sec içeriği)');
  // BR-04: credit_ledger append-only — DELETE veritabanı düzeyinde reddedilir
  // (ürün savunması; probe bunu kanıtlar). Ledger kayıtları denetim izi olarak kalır.
  const delUnlock = await q(`DELETE FROM episode_unlocks WHERE "episodeId" IN (SELECT id FROM episodes WHERE "contentId"=$1) RETURNING "creditLedgerId"`, [qa10.contentId]);
  // BR-04: credit_ledger append-only — DELETE tetikleyicisi GERÇEK satırda reddedilir
  // (var olmayan id'de tetikleyici ateşlenmez — 0 satır silinir, istisna yok).
  let ledgerGuardLive = false;
  const realLedgerId = delUnlock.map((r) => r.creditLedgerId).filter(Boolean)[0];
  if (realLedgerId) {
    try {
      await q(`DELETE FROM credit_ledger WHERE id=$1`, [realLedgerId]);
    } catch {
      ledgerGuardLive = true; // istisna = savunma canlı
    }
  }
  ok('A14.0 append-only ledger DELETE reddi (BR-04 savunması canlı)', ledgerGuardLive, `unlock ledger=${Boolean(realLedgerId)}`);
  await q(`DELETE FROM notifications WHERE ("dataJson"->>'contentId') = $1`, [qa10.contentId]);
  await q(`DELETE FROM episodes WHERE "contentId"=$1`, [qa10.contentId]);
  await q(`DELETE FROM seasons WHERE "contentId"=$1`, [qa10.contentId]);
  const delContent = await q(`DELETE FROM contents WHERE id=$1 RETURNING id`, [qa10.contentId]);
  ok('A14.1 qa10 güvenlik içeriği kaldırıldı (katalog temiz)', delContent.length === 1);
}

// ===========================================================================
// FAZ B — RevenueCat webhook güvenliği
// ===========================================================================
async function phaseB() {
  section('B1 — RC webhook Bearer + replay');
  const U = await register('rc');
  const noAuth = await req('POST', '/billing/webhooks/revenuecat', { body: { event: { type: 'TEST', id: `qa10b-${stamp}` } } });
  ok('B1.1 Bearer yok → 202 SKIPPED (işlenmez)', noAuth.status === 202 && data(noAuth)?.state === 'SKIPPED', `=${noAuth.status} ${data(noAuth)?.state}`);
  const badAuth = await req('POST', '/billing/webhooks/revenuecat', { headers: { authorization: `Bearer ${RC_SECRET}x` }, body: { event: { type: 'TEST', id: `qa10b-${stamp}` } } });
  ok('B1.2 yanlış Bearer → 202 SKIPPED (işlenmez)', badAuth.status === 202 && data(badAuth)?.state === 'SKIPPED', `=${badAuth.status} ${data(badAuth)?.state}`);
  const subEvent = { event: { type: 'INITIAL_PURCHASE', id: `qa10b-sub-${stamp}`, app_user_id: U.userId, product_id: 'perdego.sub.monthly', transaction_id: `qa10b-tx-${stamp}`, original_transaction_id: `qa10b-tx-${stamp}`, expiration_at_ms: Date.now() + 30 * 86_400_000, store: 'APP_STORE' } };
  const wh1 = await req('POST', '/billing/webhooks/revenuecat', { headers: { authorization: `Bearer ${RC_SECRET}` }, body: subEvent });
  ok('B1.3 INITIAL_PURCHASE → 202 PROCESSED', okS(wh1.status) && data(wh1)?.state === 'PROCESSED', `=${wh1.status} ${data(wh1)?.state}`);
  const sub = await req('GET', '/billing/subscription', { token: U.token });
  const subStatus = data(sub)?.status;
  ok('B1.4 abonelik aktif hak veriyor (ACTIVE/TRIALING + entitlement)', (subStatus === 'ACTIVE' || subStatus === 'TRIALING') && data(sub)?.entitlement === true, `=${subStatus} ent=${data(sub)?.entitlement}`);
  const wh2 = await req('POST', '/billing/webhooks/revenuecat', { headers: { authorization: `Bearer ${RC_SECRET}` }, body: subEvent });
  ok('B1.5 replay duplicate=true', data(wh2)?.duplicate === true, `=${JSON.stringify(data(wh2))}`);
  const txCount = await q(`SELECT COUNT(*)::int AS n FROM store_transactions WHERE "userId"=$1`, [U.userId]);
  ok('B1.6 tek store_transaction satırı', txCount[0].n === 1, `n=${txCount[0].n}`);

  section('B2 — RC kredi paketi + replay + iade');
  const packEvent = { event: { type: 'NON_RENEWING_PURCHASE', id: `qa10b-pack-${stamp}`, app_user_id: U.userId, product_id: 'perdego.pack.pack_10', transaction_id: `qa10b-ptx-${stamp}`, store: 'APP_STORE' } };
  const pw1 = await req('POST', '/billing/webhooks/revenuecat', { headers: { authorization: `Bearer ${RC_SECRET}` }, body: packEvent });
  ok('B2.1 paket webhook → PROCESSED', data(pw1)?.state === 'PROCESSED', `=${data(pw1)?.state}`);
  const w1 = await req('GET', '/credits/wallet', { token: U.token });
  ok('B2.2 cüzdan +10', data(w1)?.wallet?.creditBalance === 10, `=${data(w1)?.wallet?.creditBalance}`);
  const pw2 = await req('POST', '/billing/webhooks/revenuecat', { headers: { authorization: `Bearer ${RC_SECRET}` }, body: packEvent });
  ok('B2.3 replay duplicate=true', data(pw2)?.duplicate === true, `=${JSON.stringify(data(pw2))}`);
  const w2 = await req('GET', '/credits/wallet', { token: U.token });
  ok('B2.4 bakiye hâlâ 10', data(w2)?.wallet?.creditBalance === 10, `=${data(w2)?.wallet?.creditBalance}`);
  const fakeValidate = await req('POST', '/billing/purchases/validate', { token: U.token, headers: { 'Idempotency-Key': `qa10b-fv-${stamp}` }, body: { platform: 'IOS', productType: 'CREDIT_PACK', productId: 'perdego.pack.pack_10', storeTransactionId: `qa10b-fake-${stamp}` } });
  ok('B2.5 RC REST erişilemez → fake satın alma 503 fail-closed', fakeValidate.status === 503, `=${fakeValidate.status} ${reasonOf(fakeValidate)}`);
  const refund = { event: { type: 'REFUND', id: `qa10b-ref-${stamp}`, app_user_id: U.userId, transaction_id: `qa10b-ptx-${stamp}`, store: 'APP_STORE' } };
  const rf1 = await req('POST', '/billing/webhooks/revenuecat', { headers: { authorization: `Bearer ${RC_SECRET}` }, body: refund });
  ok('B2.6 REFUND → PROCESSED', data(rf1)?.state === 'PROCESSED', `=${data(rf1)?.state}`);
  const w3 = await req('GET', '/credits/wallet', { token: U.token });
  ok('B2.7 iade sonrası bakiye 0 (clawback)', data(w3)?.wallet?.creditBalance === 0, `=${data(w3)?.wallet?.creditBalance}`);
  const rf2 = await req('POST', '/billing/webhooks/revenuecat', { headers: { authorization: `Bearer ${RC_SECRET}` }, body: refund });
  ok('B2.8 REFUND replay duplicate=true', data(rf2)?.duplicate === true, `=${JSON.stringify(data(rf2))}`);
  const w4 = await req('GET', '/credits/wallet', { token: U.token });
  ok('B2.9 çift iade yok — bakiye 0', data(w4)?.wallet?.creditBalance === 0, `=${data(w4)?.wallet?.creditBalance}`);
}

// ===========================================================================
// FAZ C — hız sınırları (VARSAYILAN limitlerle ayrı sunucu)
// ===========================================================================
async function phaseC() {
  section('C1 — Giriş koruması (login 5/dk)');
  const first = await req('POST', '/auth/login', { body: { email: 'admin@perdego.dev', password: 'Admin12345' } });
  ok('C1.1 ilk doğru giriş 200/201 (bütçe 1/5)', first.status === 200 || first.status === 201, `=${first.status} ${JSON.stringify(first.json).slice(0, 150)}`);
  for (let i = 1; i <= 4; i++) {
    const wrong = await req('POST', '/auth/login', { body: { email: 'bruteforce@perdego.test', password: `Yanlis${i}Parola` } });
    ok(`C1.${i + 1} yanlış parola ${i + 1}/5 → 401`, wrong.status === 401, `=${wrong.status}`);
  }
  const sixth = await req('POST', '/auth/login', { body: { email: 'bruteforce@perdego.test', password: 'Yanlis6Parola' } });
  ok('C1.6 6. deneme → 429 RATE_LIMITED', sixth.status === 429 && reasonOf(sixth) === 'RATE_LIMIT_EXCEEDED', `=${sixth.status} ${reasonOf(sixth)}`);

  section('C2 — Step-up brute-force sınırı (F10-02 düzeltmesi)');
  // Pencere (koşumda 10 sn) sıfırlansın — login bütçesi taze başlar.
  await sleep(11_000);
  const admin = await login('editor@perdego.dev', 'Admin12345');
  for (let i = 1; i <= 5; i++) {
    const wrong = await req('POST', '/auth/step-up', { token: admin.token, body: { password: `Yanlis${i}Parola` } });
    ok(`C2.${i} yanlış step-up ${i}/5 → 401`, wrong.status === 401, `=${wrong.status}`);
  }
  const sixthSu = await req('POST', '/auth/step-up', { token: admin.token, body: { password: 'Admin12345' } });
  ok('C2.6 6. step-up (DOĞRU parola bile) → 429', sixthSu.status === 429, `=${sixthSu.status}`);

  section('C3 — Kayıt/şifre sıfırlama sınırları');
  for (let i = 1; i <= 3; i++) {
    const reg = await req('POST', '/auth/register', { body: { displayName: `RL ${i}`, email: `faz10-rl-${stamp}-${i}@perdego.test`, password: 'Qa123456' } });
    ok(`C3.${i} kayıt ${i}/3 → 201`, reg.status === 201, `=${reg.status}`);
  }
  const reg4 = await req('POST', '/auth/register', { body: { displayName: 'RL 4', email: `faz10-rl-${stamp}-4@perdego.test`, password: 'Qa123456' } });
  ok('C3.4 4. kayıt → 429', reg4.status === 429, `=${reg4.status}`);
  for (let i = 1; i <= 3; i++) {
    const fp = await req('POST', '/auth/forgot-password', { body: { email: `faz10-rl-${stamp}@perdego.test` } });
    ok(`C3.${4 + i} reset ${i}/3 → 200/201`, fp.status === 200 || fp.status === 201, `=${fp.status}`);
  }
  const fp4 = await req('POST', '/auth/forgot-password', { body: { email: `faz10-rl-${stamp}@perdego.test` } });
  ok('C3.8 4. reset → 429', fp4.status === 429, `=${fp4.status}`);
}

async function main() {
  console.log(`FAZ 10 güvenlik probe'u — faz ${PHASE} — ${API}`);
  if (PHASE === 'A') await phaseA();
  else if (PHASE === 'B') await phaseB();
  else if (PHASE === 'C') await phaseC();
  else throw new Error(`bilinmeyen faz: ${PHASE}`);
  console.log(`\n═══ FAZ ${PHASE} SONUCU: ${pass} PASS / ${fail} FAIL ═══`);
  if (failures.length) {
    console.log('Başarısızlar:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  await dbClient?.end().catch(() => undefined);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('PROBE ÇÖKÜŞ:', e);
  await dbClient?.end().catch(() => undefined);
  process.exit(1);
});

