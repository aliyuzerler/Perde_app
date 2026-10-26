#!/usr/bin/env node
/**
 * FAZ 8 kabul probe'u — Admin Panel uçtan uca (görevin 12 maddesi).
 *
 * Sunucular ayaktayken koşar:
 *   QA_API_BASE   doğrudan API   (varsayılan http://127.0.0.1:3002/api/v1)
 *   QA_ADMIN_BASE panel proxy'si (varsayılan http://127.0.0.1:3000/api/v1)
 *
 * Not: RBAC kanıtı DOĞRUDAN API'ye karşı üretilir (arka uç zorlaması);
 * proxy akışları panel köprüsünün bütünlüğünü kanıtlar.
 * Çıktı: her satır PASS/FAIL + sondaki özet. Çıkış kodu: fail>0 → 1.
 */
const API = process.env.QA_API_BASE ?? 'http://127.0.0.1:3002/api/v1';
const ADM = process.env.QA_ADMIN_BASE ?? 'http://127.0.0.1:3000/api/v1';
const stamp = Date.now().toString(36);

let pass = 0;
let fail = 0;
const failures = [];
const section = (t) => console.log(`\n──── ${t} ────`);
function ok(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function req(base, method, path, { token, stepUp, body, rawBody } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (stepUp) headers['x-step-up-token'] = stepUp;
  let payload;
  if (rawBody !== undefined) {
    payload = rawBody;
    headers['content-type'] = 'application/json';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['content-type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(`${base}${path}`, { method, headers, body: payload, redirect: 'manual' });
  } catch (e) {
    return { status: 0, json: null, text: '', err: String(e) };
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html/boş gövde */
  }
  return { status: res.status, json, text };
}
const data = (r) => r.json?.data;
const errCode = (r) => r.json?.error?.code ?? '(kod yok)';
/** Spesifik neden: DomainError.details.reason (envelope code geneldir). */
const reasonOf = (r) => r.json?.error?.details?.reason ?? r.json?.error?.code ?? '(kod yok)';
/** NestJS POST varsayılanı 201'dir; başarı için 200|201 kabul edilir. */
const okS = (s) => s === 200 || s === 201;

async function login(base, email, password) {
  const r = await req(base, 'POST', '/auth/login', { body: { email, password } });
  if (!okS(r.status) || !data(r)?.tokens) throw new Error(`login ${email} → ${r.status}`);
  return { ...data(r).tokens, user: data(r).user };
}
async function stepUp(base, token, password = 'Admin12345') {
  const r = await req(base, 'POST', '/auth/step-up', { token, body: { password } });
  if (!okS(r.status)) throw new Error(`step-up → ${r.status} ${errCode(r)}`);
  return data(r).stepUpToken;
}
async function poll(fn, timeoutMs = 35000, everyMs = 2000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

const S = {}; // oturumlar ve oluşturulan varlıklar
const FILM = `qa8-film-${stamp}`;
const SERIES = `qa8-dizi-${stamp}`;
const EDITOR_TITLE = `qa8-editor-taslak-${stamp}`;

async function main() {
  // ════════════════════════════════════════════════════════════════════
  section('MADDE 1 — Admin giriş ve oturum yönetimi');
  S.admin = await login(API, 'admin@perdego.dev', 'Admin12345');
  ok('1.1 admin login → role ADMIN', S.admin.user.role === 'ADMIN');
  ok('1.2 accessToken + refreshToken döndü', Boolean(S.admin.accessToken && S.admin.refreshToken));

  const wrong = await req(API, 'POST', '/auth/login', { body: { email: 'admin@perdego.dev', password: 'yanlis-parola' } });
  ok('1.3 yanlış parola → 401', wrong.status === 401, `status=${wrong.status} ${errCode(wrong)}`);

  const ghost = await req(API, 'POST', '/auth/login', { body: { email: 'yok@perdego.dev', password: 'x12345678' } });
  ok('1.4 bilinmeyen e-posta → 401', ghost.status === 401, `status=${ghost.status}`);

  const rf = await req(API, 'POST', '/auth/refresh', { body: { refreshToken: S.admin.refreshToken } });
  ok('1.5 refresh → yeni access token', okS(rf.status) && data(rf)?.tokens?.accessToken?.length > 10, `status=${rf.status}`);
  S.admin.accessToken = data(rf).tokens.accessToken;

  const rfbad = await req(API, 'POST', '/auth/refresh', { body: { refreshToken: 'sahte-token-degeri-0123456789' } });
  ok('1.6 sahte refresh → 401', rfbad.status === 401, `status=${rfbad.status} ${errCode(rfbad)}`);

  // ════════════════════════════════════════════════════════════════════
  section('MADDE 2 — Yetkisiz erişim (backend RBAC zorlaması)');
  const anon = await req(API, 'GET', '/admin/dashboard');
  ok('2.1 anonim dashboard → 401', anon.status === 401, `status=${anon.status}`);

  S.viewer = await login(API, 'viewer@perdego.dev', 'Dev12345');
  S.editor = await login(API, 'editor@perdego.dev', 'Admin12345');
  S.viewerId = S.viewer.user.id;
  S.editorId = S.editor.user.id;
  S.adminId = S.admin.user.id;

  const vDash = await req(API, 'GET', '/admin/dashboard', { token: S.viewer.accessToken });
  ok('2.2 USER dashboard → 403 ADMIN_ONLY', vDash.status === 403 && reasonOf(vDash) === 'ADMIN_ONLY', `status=${vDash.status} reason=${reasonOf(vDash)}`);
  const vCreate = await req(API, 'POST', '/admin/titles', { token: S.viewer.accessToken, body: { slug: 'hack-attempt', kind: 'FILM', titleTr: 'x', titleEn: 'x', synopsisTr: 'x', synopsisEn: 'x', releaseYear: 2026 } });
  ok('2.3 USER yapım oluşturma → 403', vCreate.status === 403, `status=${vCreate.status}`);
  const vUsers = await req(API, 'GET', '/admin/users', { token: S.viewer.accessToken });
  ok('2.4 USER kullanıcı listesi → 403', vUsers.status === 403, `status=${vUsers.status}`);

  for (const p of ['dashboard', 'users', 'plans', 'credit-packs', 'store-transactions', 'credit-ledger', 'audit-logs', 'titles']) {
    const r = await req(API, 'GET', `/admin/${p}`, { token: S.editor.accessToken });
    ok(`2.5 EDITOR GET /admin/${p} → 200`, r.status === 200, `status=${r.status} ${errCode(r)}`);
  }

  const ePlan = await req(API, 'PATCH', '/admin/plans/SUB_MONTHLY', { token: S.editor.accessToken, body: { priceKurus: 1 } });
  ok('2.6 EDITOR plan güncelleme → 403', ePlan.status === 403, `status=${ePlan.status} ${errCode(ePlan)}`);
  const eStatus = await req(API, 'PATCH', `/admin/users/${S.viewerId}/status`, { token: S.editor.accessToken, body: { status: 'SUSPENDED' } });
  ok('2.7 EDITOR kullanıcı askıya alma → 403', eStatus.status === 403, `status=${eStatus.status}`);
  const eAdjust = await req(API, 'POST', `/admin/users/${S.viewerId}/credits/adjust`, { token: S.editor.accessToken, body: { grantedDelta: 5, note: 'editör denemesi' } });
  ok('2.8 EDITOR kredi düzeltme → 403', eAdjust.status === 403, `status=${eAdjust.status}`);
  const eCamp = await req(API, 'POST', '/admin/notification-campaigns', { token: S.editor.accessToken, body: { type: 'SYSTEM', titleTr: 'x', titleEn: 'x', bodyTr: 'x', bodyEn: 'x' } });
  ok('2.9 EDITOR kampanya gönderme → 403', eCamp.status === 403, `status=${eCamp.status}`);

  const eTitle = await req(API, 'POST', '/admin/titles', { token: S.editor.accessToken, body: { slug: EDITOR_TITLE, kind: 'FILM', titleTr: 'Editör Taslak', titleEn: 'Editor Draft', synopsisTr: 'QA', synopsisEn: 'QA', releaseYear: 2026 } });
  ok('2.10 EDITOR yapım oluşturma → 201/200', eTitle.status === 200 || eTitle.status === 201, `status=${eTitle.status}`);
  S.editorTitleId = data(eTitle)?.id ?? null;

  // ════════════════════════════════════════════════════════════════════
  section('MADDE 3 — Yapım oluşturma, düzenleme, taslak, yayınlama');
  const film = await req(API, 'POST', '/admin/titles', { token: S.admin.accessToken, body: { slug: FILM, kind: 'FILM', titleTr: 'QA8 Filmi', titleEn: 'QA8 Film', synopsisTr: 'Kabul probe içeriği', synopsisEn: 'Acceptance probe content', releaseYear: 2026, ageRating: '13+', accessType: 'FREE', categorySlugs: ['aksiyon'] } });
  S.filmId = data(film)?.id;
  ok('3.1 yapım oluşturuldu → DRAFT', (film.status === 200 || film.status === 201) && data(film)?.status === 'DRAFT', `status=${film.status} ${JSON.stringify(data(film)?.status)}`);

  const catDraft = await req(API, 'GET', `/catalog/titles?page=1&pageSize=50`);
  const draftLeak = JSON.stringify(catDraft.json ?? {}).includes(`"${FILM}"`);
  ok('3.2 taslak herkese açık katalogda GÖRÜNMEZ', catDraft.status === 200 && !draftLeak, 'taslak sızdı!');

  const patch = await req(API, 'PATCH', `/admin/titles/${S.filmId}`, { token: S.admin.accessToken, body: { titleTr: 'QA8 Filmi (düzenli)', posterUrl: 'https://cdn.perdego.dev/qa8/poster.jpg', categorySlugs: ['aksiyon', 'dram'] } });
  const detail = await req(API, 'GET', `/admin/titles/${S.filmId}`, { token: S.admin.accessToken });
  ok('3.3 düzenleme kaydedildi (başlık+afiş+kategori)', patch.status === 200 && data(detail)?.titleTr === 'QA8 Filmi (düzenli)' && data(detail)?.posterUrl === 'https://cdn.perdego.dev/qa8/poster.jpg' && (data(detail)?.categories ?? []).length === 2, `patch=${patch.status} cats=${(data(detail)?.categories ?? []).length}`);

  const pub = await req(API, 'PATCH', `/admin/titles/${S.filmId}/status`, { token: S.admin.accessToken, body: { status: 'PUBLISHED' } });
  ok('3.4 DRAFT→PUBLISHED geçişi + publishedAt', pub.status === 200 && data(pub)?.status === 'PUBLISHED' && Boolean(data(pub)?.publishedAt), `status=${pub.status} ${errCode(pub)}`);

  const catPub = await req(API, 'GET', `/catalog/titles?page=1&pageSize=50`);
  ok('3.5 yayınlanınca katalogda GÖRÜNÜR', JSON.stringify(catPub.json ?? {}).includes(`"${FILM}"`), 'yayın sonrası katalogda yok');

  const badT = await req(API, 'PATCH', `/admin/titles/${S.filmId}/status`, { token: S.admin.accessToken, body: { status: 'PROCESSING' } });
  ok('3.6 geçersiz geçiş PUBLISHED→PROCESSING → 400', badT.status === 400, `status=${badT.status} ${errCode(badT)}`);

  const arch = await req(API, 'PATCH', `/admin/titles/${S.filmId}/status`, { token: S.admin.accessToken, body: { status: 'ARCHIVED' } });
  const back = await req(API, 'PATCH', `/admin/titles/${S.filmId}/status`, { token: S.admin.accessToken, body: { status: 'PUBLISHED' } });
  ok('3.7 matris: PUBLISHED→ARCHIVED→PUBLISHED', arch.status === 200 && back.status === 200, `arch=${arch.status} back=${back.status}`);

  const legacy = await req(API, 'POST', `/admin/titles/${S.editorTitleId}/publish`, { token: S.admin.accessToken });
  ok('3.8 legacy publish ucu çalışır (editör taslağı yayınlama)', okS(legacy.status) && data(legacy)?.status === 'PUBLISHED', `status=${legacy.status} ${errCode(legacy)}`);

  // ════════════════════════════════════════════════════════════════════
  section('MADDE 4 — Sezon ve bölüm yönetimi (sıralama + yayın durumu)');
  const series = await req(API, 'POST', '/admin/titles', { token: S.admin.accessToken, body: { slug: SERIES, kind: 'SERIES', seriesFormat: 'MINI', titleTr: 'QA8 Dizisi', titleEn: 'QA8 Series', synopsisTr: 'QA', synopsisEn: 'QA', releaseYear: 2026, accessType: 'SUBSCRIPTION' } });
  S.seriesId = data(series)?.id;
  ok('4.1 SERIES taslağı oluşturuldu', series.status === 200 || series.status === 201, `status=${series.status}`);

  const season = await req(API, 'POST', `/admin/titles/${S.seriesId}/seasons`, { token: S.admin.accessToken, body: { seasonNumber: 1, titleTr: 'Birinci Sezon' } });
  S.seasonId = data(season)?.id;
  ok('4.2 sezon 1 oluşturuldu', season.status === 200 || season.status === 201, `status=${season.status}`);
  const seasonDup = await req(API, 'POST', `/admin/titles/${S.seriesId}/seasons`, { token: S.admin.accessToken, body: { seasonNumber: 1 } });
  ok('4.3 tekrar sezon 1 → 409', seasonDup.status === 409, `status=${seasonDup.status} ${errCode(seasonDup)}`);

  const ep = (n, accessType, extra = {}) => req(API, 'POST', `/admin/titles/${S.seriesId}/episodes`, { token: S.admin.accessToken, body: { seasonNumber: 1, episodeNumber: n, titleTr: `Bölüm ${n}`, titleEn: `Episode ${n}`, durationSeconds: 60 * n, accessType, ...extra } });
  const e1 = await ep(1, 'FREE');
  S.e1 = data(e1)?.id;
  ok('4.4 bölüm 1 (FREE) oluşturuldu (taslak olarak başlar — Kural: DRAFT)', okS(e1.status) && Boolean(S.e1), `status=${e1.status} ${errCode(e1)}`);
  const e1dup = await ep(1, 'FREE');
  ok('4.5 tekrar bölüm 1 → 409', e1dup.status === 409, `status=${e1dup.status}`);
  const e2 = await ep(2, 'SUBSCRIPTION');
  S.e2 = data(e2)?.id;
  const e3 = await ep(3, 'CREDIT', { creditCost: 25 });
  S.e3 = data(e3)?.id;
  ok('4.6 bölüm 2 SUBSCRIPTION + bölüm 3 CREDIT(cost 25)', e2.status === 200 || e2.status === 201 ? (e3.status === 200 || e3.status === 201) : false, `e2=${e2.status} e3=${e3.status}`);

  const eNoCost = await ep(4, 'CREDIT');
  ok('MADDE 6·a CREDIT creditCost’suz → 400', eNoCost.status === 400, `status=${eNoCost.status} ${errCode(eNoCost)}`);

  const epUp = await req(API, 'PATCH', `/admin/episodes/${S.e1}`, { token: S.admin.accessToken, body: { titleTr: 'Bölüm 1 (düzenli)', durationSeconds: 95 } });
  const detAfter = await req(API, 'GET', `/admin/titles/${S.seriesId}`, { token: S.admin.accessToken });
  const eps = (data(detAfter)?.seasons?.[0]?.episodes ?? data(detAfter)?.episodes ?? []);
  const numbers = eps.map((x) => x.episodeNumber);
  ok('4.7 bölüm düzenleme kaydedildi', epUp.status === 200, `status=${epUp.status}`);
  ok('4.8 bölümler numaraya göre sıralı + DRAFT', numbers.length >= 3 && numbers.every((n, i) => i === 0 || numbers[i - 1] <= n) && eps.every((x) => x.status === 'DRAFT'), `sıra=${numbers.join(',')} durumlar=${eps.map((x) => x.status).join(',')}`);

  const st1 = await req(API, 'PATCH', `/admin/episodes/${S.e1}/status`, { token: S.admin.accessToken, body: { status: 'PUBLISHED' } });
  const st1b = await req(API, 'PATCH', `/admin/episodes/${S.e1}/status`, { token: S.admin.accessToken, body: { status: 'ARCHIVED' } });
  const st1c = await req(API, 'PATCH', `/admin/episodes/${S.e1}/status`, { token: S.admin.accessToken, body: { status: 'DRAFT' } });
  ok('4.9 bölüm matrisi PUBLISHED→ARCHIVED→DRAFT', st1.status === 200 && st1b.status === 200 && st1c.status === 200, `p=${st1.status} a=${st1b.status} d=${st1c.status}`);
  const stBad = await req(API, 'PATCH', `/admin/episodes/${S.e3}/status`, { token: S.admin.accessToken, body: { status: 'SCHEDULED' } });
  ok('4.10 geçersiz bölüm geçişi (DRAFT→SCHEDULED) → 400', stBad.status === 400, `status=${stBad.status} ${errCode(stBad)}`);

  const e4 = await ep(4, 'FREE');
  S.e4 = data(e4)?.id;
  const delOk = await req(API, 'DELETE', `/admin/episodes/${S.e4}`, { token: S.admin.accessToken });
  ok('4.11 temiz taslak bölüm silinebilir', delOk.status === 200, `status=${delOk.status}`);
  const pub3 = await req(API, 'PATCH', `/admin/episodes/${S.e3}/status`, { token: S.admin.accessToken, body: { status: 'PUBLISHED' } });
  const delPub = await req(API, 'DELETE', `/admin/episodes/${S.e3}`, { token: S.admin.accessToken });
  ok('4.12 yayındaki bölüm silinemez → 409 (korumalı)', pub3.status === 200 && delPub.status === 409, `pub=${pub3.status} del=${delPub.status} ${errCode(delPub)}`);
  await req(API, 'PATCH', `/admin/episodes/${S.e3}/status`, { token: S.admin.accessToken, body: { status: 'DRAFT' } });

  // ════════════════════════════════════════════════════════════════════
  section('MADDE 5 — Kategori, afiş ve video metadata yönetimi');
  const meta = await req(API, 'PATCH', `/admin/titles/${S.filmId}`, { token: S.admin.accessToken, body: { heroImageUrl: 'https://cdn.perdego.dev/qa8/hero.jpg', verticalPreviewUrl: 'https://cdn.perdego.dev/qa8/preview.mp4', taglineTr: 'Deneme sloganı' } });
  const detMeta = await req(API, 'GET', `/admin/titles/${S.filmId}`, { token: S.admin.accessToken });
  ok('5.1 afiş/video metaverisi kaydedildi', meta.status === 200 && data(detMeta)?.heroImageUrl?.includes('hero.jpg') && data(detMeta)?.verticalPreviewUrl?.includes('preview.mp4'), `hero=${data(detMeta)?.heroImageUrl}`);

  const banner = await req(API, 'POST', '/admin/banners', { token: S.admin.accessToken, body: { slug: `qa8-banner-${stamp}`, titleTr: 'QA8 Afişi', titleEn: 'QA8 Banner', imageUrl: 'https://cdn.perdego.dev/qa8/banner.jpg', targetContentId: S.filmId, sortOrder: 99 } });
  S.bannerId = data(banner)?.id;
  ok('5.2 banner oluşturuldu', banner.status === 200 || banner.status === 201, `status=${banner.status}`);
  const bUp = await req(API, 'PATCH', `/admin/banners/${S.bannerId}`, { token: S.admin.accessToken, body: { sortOrder: 1, isActive: true } });
  const bList = await req(API, 'GET', '/admin/banners', { token: S.admin.accessToken });
  ok('5.3 banner sıra güncelleme + listede görünür', bUp.status === 200 && JSON.stringify(bList.json ?? {}).includes(`qa8-banner-${stamp}`), `up=${bUp.status}`);
  const bDel = await req(API, 'DELETE', `/admin/banners/${S.bannerId}`, { token: S.admin.accessToken });
  ok('5.4 banner silindi', bDel.status === 200, `status=${bDel.status}`);

  const sec = await req(API, 'POST', '/admin/home-sections', { token: S.admin.accessToken, body: { key: `qa8-rail-${stamp}`, sectionType: 'RAIL', titleTr: 'QA8 Rayı', titleEn: 'QA8 Rail', contentLimit: 10, sortOrder: 90 } });
  S.secId = data(sec)?.id ?? data(sec)?.section?.id;
  ok('5.5 ana sayfa bölümü oluşturuldu', sec.status === 200 || sec.status === 201, `status=${sec.status}`);
  const item = await req(API, 'POST', `/admin/home-sections/${S.secId}/items`, { token: S.admin.accessToken, body: { contentId: S.filmId } });
  ok('5.6 yayındaki yapım bölüme eklendi', item.status === 200 || item.status === 201, `status=${item.status} ${errCode(item)}`);
  const secList = await req(API, 'GET', '/admin/home-sections', { token: S.admin.accessToken });
  const secJson = JSON.stringify(secList.json ?? {});
  ok('5.7 bölüm listede item ile görünüyor', secJson.includes(`qa8-rail-${stamp}`) && secJson.includes(S.filmId), 'item eşleşmedi');
  const item2 = await req(API, 'POST', `/admin/home-sections/${S.secId}/items`, { token: S.admin.accessToken, body: { contentId: S.seriesId } });
  const rm2 = await req(API, 'DELETE', `/admin/home-sections/${S.secId}/items/${data(item2)?.id ?? data(item2)?.itemId}`, { token: S.admin.accessToken });
  ok('5.8 ikinci item ekle + çıkar (sıralama yönetimi)', (item2.status === 200 || item2.status === 201) && rm2.status === 200, `add=${item2.status} rm=${rm2.status}`);

  // ════════════════════════════════════════════════════════════════════
  section('MADDE 6 — Erişim modeli kuralları (ücretsiz/abonelik/kredi)');
  const acc = await req(API, 'PATCH', `/admin/titles/${S.filmId}`, { token: S.admin.accessToken, body: { accessType: 'SUBSCRIPTION' } });
  const detAcc = await req(API, 'GET', `/admin/titles/${S.filmId}`, { token: S.admin.accessToken });
  ok('6.1 yapım erişim modeli SUBSCRIPTION kaydedildi', acc.status === 200 && data(detAcc)?.accessType === 'SUBSCRIPTION', `=${data(detAcc)?.accessType}`);
  await req(API, 'PATCH', `/admin/titles/${S.filmId}`, { token: S.admin.accessToken, body: { accessType: 'FREE' } });

  const epUpCost = await req(API, 'PATCH', `/admin/episodes/${S.e1}`, { token: S.admin.accessToken, body: { accessType: 'CREDIT' } });
  ok('6.2 bölüm CREDIT’e creditCost’suz geçiş → 400', epUpCost.status === 400, `status=${epUpCost.status} ${errCode(epUpCost)}`);
  const epCost = await req(API, 'PATCH', `/admin/episodes/${S.e1}`, { token: S.admin.accessToken, body: { accessType: 'CREDIT', creditCost: 15 } });
  const detE1 = await req(API, 'GET', `/admin/titles/${S.seriesId}`, { token: S.admin.accessToken });
  const e1row = JSON.stringify(detE1.json ?? {});
  ok('6.3 bölüm CREDIT cost=15 kaydedildi', epCost.status === 200 && e1row.includes('"creditCost":15'), `status=${epCost.status}`);
  await req(API, 'PATCH', `/admin/episodes/${S.e1}`, { token: S.admin.accessToken, body: { accessType: 'FREE', creditCost: null } });

  // ════════════════════════════════════════════════════════════════════
  section('MADDE 7 — Kredi paketi ve abonelik ürün ayarları (step-up)');
  const plans = await req(API, 'GET', '/admin/plans', { token: S.admin.accessToken });
  const plan = (data(plans)?.items ?? []).find((p) => p.id === 'SUB_MONTHLY') ?? (data(plans)?.items ?? [])[0];
  ok('7.1 planlar ürün kimlikleriyle listelenir', plans.status === 200 && Boolean(plan?.platformProductIdIos || plan?.platformProductIdAndroid || plan?.id), `plans=${(data(plans)?.items ?? []).length}`);

  const noStep = await req(API, 'PATCH', `/admin/plans/${plan.id}`, { token: S.admin.accessToken, body: { priceKurus: 5490 } });
  ok('7.2 step-up’sız plan güncelleme → 401 STEP_UP_REQUIRED', noStep.status === 401 && reasonOf(noStep) === 'STEP_UP_REQUIRED', `status=${noStep.status} reason=${reasonOf(noStep)}`);

  const suWrong = await req(API, 'POST', '/auth/step-up', { token: S.admin.accessToken, body: { password: 'yanlis-parola' } });
  ok('7.3 step-up yanlış parola → 401', suWrong.status === 401, `status=${suWrong.status}`);
  S.step = await stepUp(API, S.admin.accessToken);
  ok('7.4 step-up doğru parola → token', Boolean(S.step) && S.step.startsWith('stup1.'), '');

  const planUp = await req(API, 'PATCH', `/admin/plans/${plan.id}`, { token: S.admin.accessToken, stepUp: S.step, body: { priceKurus: 5490 } });
  const plans2 = await req(API, 'GET', '/admin/plans', { token: S.admin.accessToken });
  const plan2 = (data(plans2)?.items ?? []).find((p) => p.id === plan.id);
  ok('7.5 step-up ile fiyat 5490 kaydedildi', planUp.status === 200 && plan2?.priceKurus === 5490, `up=${planUp.status} fiyat=${plan2?.priceKurus}`);
  const revert = await req(API, 'PATCH', `/admin/plans/${plan.id}`, { token: S.admin.accessToken, stepUp: S.step, body: { priceKurus: 4990 } });
  ok('7.6 fiyat geri alındı (4990)', revert.status === 200, `status=${revert.status}`);

  const packs = await req(API, 'GET', '/admin/credit-packs', { token: S.admin.accessToken });
  const pack = (data(packs)?.items ?? [])[0];
  const packUp = await req(API, 'PATCH', `/admin/credit-packs/${pack.id}`, { token: S.admin.accessToken, stepUp: S.step, body: { bonusCredits: 12 } });
  const packs2 = await req(API, 'GET', '/admin/credit-packs', { token: S.admin.accessToken });
  const pack2 = (data(packs2)?.items ?? []).find((p) => p.id === pack.id);
  ok('7.7 paket bonus kredi 12 kaydedildi + geri alındı', packUp.status === 200 && pack2?.bonusCredits === 12 && (await req(API, 'PATCH', `/admin/credit-packs/${pack.id}`, { token: S.admin.accessToken, stepUp: S.step, body: { bonusCredits: pack.bonusCredits ?? 0 } })).status === 200, `bonus=${pack2?.bonusCredits}`);

  const eSu = await stepUp(API, S.editor.accessToken);
  const ePlanSu = await req(API, 'PATCH', `/admin/plans/${plan.id}`, { token: S.editor.accessToken, stepUp: eSu, body: { priceKurus: 1 } });
  ok('7.8 EDITOR kendi step-up tokenıyla bile → 403', ePlanSu.status === 403, `status=${ePlanSu.status} ${errCode(ePlanSu)}`);

  // ════════════════════════════════════════════════════════════════════
  section('MADDE 8 — Satın alma kayıtları ve kredi hareketleri');
  const tx = await req(API, 'GET', '/admin/store-transactions?page=1&pageSize=20', { token: S.admin.accessToken });
  ok('8.1 satın alma kayıtları liste şeması (items+meta)', tx.status === 200 && Array.isArray(data(tx)?.items) && Boolean(data(tx)?.meta), `status=${tx.status}`);
  const txF = await req(API, 'GET', '/admin/store-transactions?state=PURCHASED&productType=CREDIT_PACK', { token: S.admin.accessToken });
  ok('8.2 state+productType filtresi çalışır', txF.status === 200 && (data(txF)?.items ?? []).every((i) => i.purchaseState === 'PURCHASED' && i.productType === 'CREDIT_PACK'), `items=${(data(txF)?.items ?? []).length}`);

  const ledger = await req(API, 'GET', '/admin/credit-ledger?page=1&pageSize=20', { token: S.admin.accessToken });
  ok('8.3 kredi ledger liste şeması', ledger.status === 200 && Array.isArray(data(ledger)?.items), `status=${ledger.status}`);

  const adj = await req(API, 'POST', `/admin/users/${S.viewerId}/credits/adjust`, { token: S.admin.accessToken, body: { grantedDelta: 5, note: 'QA8 kabul: kredi düzeltme kanıtı' } });
  ok('8.4 ADMIN kredi düzeltme (+5) kaydedildi', adj.status === 200 || adj.status === 201, `status=${adj.status} ${errCode(adj)}`);
  const ledgerAdj = await req(API, 'GET', `/admin/credit-ledger?userId=${S.viewerId}&pageSize=20`, { token: S.admin.accessToken });
  const adjRow = (data(ledgerAdj)?.items ?? []).find((i) => i.note === 'QA8 kabul: kredi düzeltme kanıtı');
  ok('8.5 düzeltme ledger’da GRANT(+5, ADMIN_ADJUSTMENT) olarak görünür', Boolean(adjRow) && adjRow?.delta === 5 && adjRow?.referenceType === 'ADMIN_ADJUSTMENT', `items=${(data(ledgerAdj)?.items ?? []).length} bulundu=${Boolean(adjRow)}`);
  const adjBad = await req(API, 'POST', `/admin/users/${S.viewerId}/credits/adjust`, { token: S.admin.accessToken, body: { grantedDelta: 1, note: 'x' } });
  ok('8.6 gerekçesiz/ kısa notlu düzeltme → 400', adjBad.status === 400, `status=${adjBad.status}`);
  const adjZero = await req(API, 'POST', `/admin/users/${S.viewerId}/credits/adjust`, { token: S.admin.accessToken, body: { note: 'QA8 sıfır delta denemesi' } });
  ok('8.7 sıfır delta düzeltmesi → 400', adjZero.status === 400, `status=${adjZero.status}`);

  // ════════════════════════════════════════════════════════════════════
  section('MADDE 9 — Bildirim kampanyaları ve içerik sıralama');
  const camp = await req(API, 'POST', '/admin/notification-campaigns', { token: S.admin.accessToken, stepUp: S.step, body: { type: 'NEW_CONTENT', titleTr: 'QA8 Yeni içerik', titleEn: 'QA8 New content', bodyTr: 'QA8 filmi yayınlandı', bodyEn: 'QA8 film is live', dataJson: { contentId: S.filmId } } });
  S.campId = data(camp)?.id;
  ok('9.1 kampanya oluşturuldu (derhal gönderim)', camp.status === 200 || camp.status === 201, `status=${camp.status} ${errCode(camp)}`);
  const sent = await poll(async () => {
    const list = await req(API, 'GET', '/admin/notification-campaigns', { token: S.admin.accessToken });
    const row = (data(list)?.items ?? []).find((c) => c.id === S.campId);
    return row && (row.status === 'SENT' || row.status === 'FAILED') ? row : null;
  });
  ok('9.2 kampanya SENT oldu + alıcı sayısı > 0', Boolean(sent) && sent.status === 'SENT' && sent.recipientCount > 0, sent ? `status=${sent.status} alıcı=${sent.recipientCount}` : '35 sn içinde SENT olmadı');
  S.campRecipientCount = sent?.recipientCount ?? 0;

  const future = new Date(Date.now() + 10 * 60_000).toISOString();
  const campS = await req(API, 'POST', '/admin/notification-campaigns', { token: S.admin.accessToken, stepUp: S.step, body: { type: 'PROMO', titleTr: 'QA8 planlı', titleEn: 'QA8 scheduled', bodyTr: 'planlı gönderim', bodyEn: 'scheduled', scheduledFor: future } });
  S.campScheduledId = data(campS)?.id;
  ok('9.3 planlı kampanya SCHEDULED', (campS.status === 200 || campS.status === 201) && data(campS)?.status === 'SCHEDULED', `status=${campS.status} ${data(campS)?.status}`);
  const cancel = await req(API, 'POST', `/admin/notification-campaigns/${S.campScheduledId}/cancel`, { token: S.admin.accessToken, stepUp: S.step });
  const campAfter = await req(API, 'GET', '/admin/notification-campaigns', { token: S.admin.accessToken });
  const canceledRow = (data(campAfter)?.items ?? []).find((c) => c.id === S.campScheduledId);
  ok('9.4 planlı kampanya iptal → CANCELLED', okS(cancel.status) && canceledRow?.status === 'CANCELLED', `cancel=${cancel.status} durum=${canceledRow?.status}`);
  const campBad = await req(API, 'POST', '/admin/notification-campaigns', { token: S.admin.accessToken, stepUp: S.step, body: { type: 'PROMO', titleTr: '', titleEn: '', bodyTr: '', bodyEn: '' } });
  ok('9.5 boş kampanya gövdesi → 400', campBad.status === 400, `status=${campBad.status}`);

  // ════════════════════════════════════════════════════════════════════
  section('MADDE 10 — Audit log kayıtları (kim/ne/ne zaman)');
  const aTitle = await req(API, 'GET', `/admin/audit-logs?action=CONTENT_UPDATE&entityId=${S.filmId}&pageSize=10`, { token: S.admin.accessToken });
  const aTitleRow = (data(aTitle)?.items ?? [])[0];
  ok('10.1 TITLE_UPDATED kaydı (önce/sonra + aktör)', aTitle.status === 200 && aTitleRow && aTitleRow.actorUserId === S.adminId && aTitleRow.before !== undefined && aTitleRow.after !== undefined, `items=${(data(aTitle)?.items ?? []).length}`);

  const aPlan = await req(API, 'GET', `/admin/audit-logs?action=PLAN_UPDATE&pageSize=10`, { token: S.admin.accessToken });
  const aPlanRow = (data(aPlan)?.items ?? []).find((i) => JSON.stringify(i.after ?? {}).includes('5490'));
  ok('10.2 PLAN_UPDATED fiyat değişimi izde (5490)', Boolean(aPlanRow), 'PLAN_UPDATED/5490 bulunamadı');

  const susp = await req(API, 'PATCH', `/admin/users/${S.viewerId}/status`, { token: S.admin.accessToken, stepUp: S.step, body: { status: 'SUSPENDED' } });
  const vLogin = await req(API, 'POST', '/auth/login', { body: { email: 'viewer@perdego.dev', password: 'Dev12345' } });
  ok('10.3 askıya alınan kullanıcı girişi → 403', susp.status === 200 && vLogin.status === 403, `susp=${susp.status} login=${vLogin.status}`);
  const restore = await req(API, 'PATCH', `/admin/users/${S.viewerId}/status`, { token: S.admin.accessToken, stepUp: S.step, body: { status: 'ACTIVE' } });
  const vLogin2 = await req(API, 'POST', '/auth/login', { body: { email: 'viewer@perdego.dev', password: 'Dev12345' } });
  ok('10.4 geri alım sonrası giriş tekrar başarılı', restore.status === 200 && okS(vLogin2.status), `restore=${restore.status} login=${vLogin2.status}`);

  const aUser = await req(API, 'GET', `/admin/audit-logs?action=USER_STATUS_CHANGE&pageSize=10`, { token: S.admin.accessToken });
  ok('10.5 USER_STATUS_CHANGE ×2 izde', (data(aUser)?.items ?? []).length >= 2, `items=${(data(aUser)?.items ?? []).length}`);
  const aCamp = await req(API, 'GET', `/admin/audit-logs?action=CAMPAIGN_SENT&pageSize=10`, { token: S.admin.accessToken });
  ok('10.6 CAMPAIGN_SENT izde', (data(aCamp)?.items ?? []).some((i) => i.entityId === S.campId), `items=${(data(aCamp)?.items ?? []).length}`);

  const aActor = await req(API, 'GET', `/admin/audit-logs?actorId=${S.editorId}&pageSize=20`, { token: S.admin.accessToken });
  ok('10.7 actorId filtresi yalnız editör kayıtlarını döner', aActor.status === 200 && (data(aActor)?.items ?? []).length > 0 && (data(aActor)?.items ?? []).every((i) => i.actorUserId === S.editorId), `items=${(data(aActor)?.items ?? []).length}`);

  const selfRole = await req(API, 'PATCH', `/admin/users/${S.adminId}/role`, { token: S.admin.accessToken, stepUp: S.step, body: { role: 'USER' } });
  ok('10.8 kendi rolünü değiştirme → 409 (kendine işlem koruması)', selfRole.status === 409, `status=${selfRole.status} ${errCode(selfRole)}`);

  // ════════════════════════════════════════════════════════════════════
  section('MADDE 11 — Form doğrulaması, sunucu hataları, yükleme durumları');
  const v1 = await req(API, 'POST', '/admin/titles', { token: S.admin.accessToken, body: { slug: `qa8-eksik-${stamp}`, kind: 'FILM' } });
  ok('11.1 eksik alanlı yapım → 400 VALIDATION_FAILED', v1.status === 400 && reasonOf(v1) === 'VALIDATION_FAILED', `status=${v1.status} reason=${reasonOf(v1)}`);
  const v2 = await req(API, 'POST', '/admin/titles', { token: S.admin.accessToken, body: { slug: 'Kötü Slug!', kind: 'FILM', titleTr: 'x', titleEn: 'x', synopsisTr: 'x', synopsisEn: 'x', releaseYear: 2026 } });
  ok('11.2 geçersiz slug → 400', v2.status === 400, `status=${v2.status}`);
  const v3 = await req(API, 'POST', '/admin/titles', { token: S.admin.accessToken, body: { slug: `qa8-yil-${stamp}`, kind: 'FILM', titleTr: 'x', titleEn: 'x', synopsisTr: 'x', synopsisEn: 'x', releaseYear: 1800 } });
  ok('11.3 yayın yılı 1800 → 400', v3.status === 400, `status=${v3.status}`);
  const nf1 = await req(API, 'GET', '/admin/titles/qa8-olmayan-kayit', { token: S.admin.accessToken });
  ok('11.4 olmayan yapım → 404', nf1.status === 404, `status=${nf1.status} ${errCode(nf1)}`);
  const nf2 = await req(API, 'PATCH', '/admin/episodes/qa8-olmayan-bolum/status', { token: S.admin.accessToken, body: { status: 'PUBLISHED' } });
  ok('11.5 olmayan bölüm → 404', nf2.status === 404, `status=${nf2.status}`);
  const dash = await req(API, 'GET', '/admin/dashboard?from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z', { token: S.admin.accessToken });
  ok('11.6 dashboard tarih aralıklı seri döner', dash.status === 200 && Array.isArray(data(dash)?.series), `status=${dash.status}`);
  const dashBad = await req(API, 'GET', '/admin/dashboard?from=not-a-date', { token: S.admin.accessToken });
  ok('11.7 bozuk tarih → 400', dashBad.status === 400, `status=${dashBad.status} ${errCode(dashBad)}`);
  const bigPage = await req(API, 'GET', '/admin/titles?page=1&pageSize=500', { token: S.admin.accessToken });
  ok('11.8 aşırı pageSize → 400 (maks 50)', bigPage.status === 400, `status=${bigPage.status} ${errCode(bigPage)}`);
  const dashAfter = await req(API, 'GET', '/admin/dashboard', { token: S.admin.accessToken });
  ok('11.9 hatalar sonrası sunucu ayakta ve sağlıklı', dashAfter.status === 200 && data(dashAfter)?.users?.total > 0, `status=${dashAfter.status}`);

  // ════════════════════════════════════════════════════════════════════
  section('MADDE 12 — Yetkisiz/bozuk API istekleri + panel köprüsü');
  const malformed = await req(API, 'POST', '/admin/titles', { token: S.admin.accessToken, rawBody: '{"slug": "kirik-json"' });
  ok('12.1 bozuk JSON gövde → 400 (500 değil)', malformed.status === 400, `status=${malformed.status}`);
  const strBody = await req(API, 'POST', '/admin/titles', { token: S.admin.accessToken, rawBody: '"dizgi-govde"' });
  ok('12.2 dizgi gövde → 400', strBody.status === 400, `status=${strBody.status}`);
  const garb = await req(API, 'GET', '/admin/dashboard', { token: 'eyJhbGciOiJSUzI1NiJ9.sahte.imza' });
  ok('12.3 sahte bearer → 401', garb.status === 401, `status=${garb.status} ${errCode(garb)}`);
  const badStep = await req(API, 'PATCH', `/admin/plans/SUB_MONTHLY`, { token: S.admin.accessToken, stepUp: 'stup1.sahte.imza', body: { priceKurus: 1 } });
  ok('12.4 sahte step-up token → 403', badStep.status === 403, `status=${badStep.status} ${errCode(badStep)}`);
  const crossStep = await req(API, 'PATCH', `/admin/plans/SUB_MONTHLY`, { token: S.admin.accessToken, stepUp: await stepUp(API, S.editor.accessToken), body: { priceKurus: 1 } });
  ok('12.5 başkasının step-up tokenı → 403 (sub bağlı)', crossStep.status === 403, `status=${crossStep.status} ${errCode(crossStep)}`);
  const sqli = await req(API, 'GET', `/admin/titles?search=${encodeURIComponent("'; DROP TABLE \"User\";--")}`, { token: S.admin.accessToken });
  ok('12.6 SQL benzeri arama → 200, veri bütünü korundu', sqli.status === 200 && (await req(API, 'GET', '/admin/users?pageSize=1', { token: S.admin.accessToken })).status === 200, `status=${sqli.status}`);
  const xss = await req(API, 'PATCH', `/admin/titles/${S.filmId}`, { token: S.admin.accessToken, body: { taglineTr: '<script>alert(1)</script>' } });
  const xssBack = await req(API, 'PATCH', `/admin/titles/${S.filmId}`, { token: S.admin.accessToken, body: { taglineTr: null } });
  ok('12.7 XSS desenli değer çökertmez + temizlendi', xss.status === 200 && xssBack.status === 200, `x=${xss.status} b=${xssBack.status}`);

  // Panel köprüsü (production rewrite) — gerçek panel yolu
  const pxLogin = await login(ADM, 'admin@perdego.dev', 'Admin12345');
  const pxDash = await req(ADM, 'GET', '/admin/dashboard', { token: pxLogin.accessToken });
  const pxStep = await stepUp(ADM, pxLogin.accessToken);
  const pxPlan = await req(ADM, 'PATCH', `/admin/plans/${plan.id}`, { token: pxLogin.accessToken, stepUp: pxStep, body: { trialDays: 8 } });
  const pxPlanBack = await req(ADM, 'GET', '/admin/plans', { token: pxLogin.accessToken });
  const pxPlanRow = (data(pxPlanBack)?.items ?? []).find((p) => p.id === plan.id);
  const pxPlanRevert = await req(ADM, 'PATCH', `/admin/plans/${plan.id}`, { token: pxLogin.accessToken, stepUp: pxStep, body: { trialDays: 7 } });
  ok('12.8 panel proxy üzerinden login+dashboard', pxDash.status === 200 && Boolean(data(pxDash)?.users?.total !== undefined), `dash=${pxDash.status}`);
  ok('12.9 panel proxy üzerinden step-up’lı yazma (deneme 8 gün → geri 7)', pxPlan.status === 200 && pxPlanRow?.trialDays === 8 && pxPlanRevert.status === 200, `up=${pxPlan.status} trial=${pxPlanRow?.trialDays}`);
  const pxAnon = await req(ADM, 'GET', '/admin/users');
  ok('12.10 proxy üzerinden anonim admin istek → 401', pxAnon.status === 401, `status=${pxAnon.status}`);

  // ── Özet ────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log(`FAZ 8 KABUL PROBE: ${pass} PASS / ${fail} FAIL`);
  if (failures.length) {
    console.log('Başarısızlar:');
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('PROBE KRİTİK HATA:', e);
  process.exit(2);
});
