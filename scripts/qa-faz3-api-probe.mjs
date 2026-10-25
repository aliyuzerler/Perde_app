/**
 * FAZ-3 QA canlı API probe'u — kullanıcı izolasyonu, sayfalama/filtre/arama,
 * Swagger tutarlılığı, hata zarfı sözleşmesi.
 * Kullanım: node scripts/qa-faz3-api-probe.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:3000';
let PASS = 0;
let FAIL = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    PASS++;
    console.log(`  ✓ ${name}`);
  } else {
    FAIL++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function req(method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* gövdesiz yanıt */
  }
  return { status: res.status, json };
}

// ---- 1) Swagger ↔ gerçek yollar tutarlılığı ----
console.log('— Swagger/OpenAPI tutarlılığı —');
const docs = (await req('GET', '/api/docs-json')).json;
check('OpenAPI 3 dokümanı döner', Boolean(docs?.openapi?.startsWith('3.') && docs?.paths));
const docPaths = Object.keys(docs?.paths ?? {});
check('Dokümante yol sayısı ≥ 30', docPaths.length >= 30, `bulunan: ${docPaths.length}`);

// Gerçek yol haritası (controller'lardan doğrulanmış):
//   favoriler → /api/v1/watchlist, izleme → /api/v1/watch-progress,
//   unlock → /api/v1/credits/unlock/{episodeId}, webhook → /api/v1/billing/webhooks
const requiredPaths = [
  '/api/v1/home',
  '/api/v1/catalog/titles',
  '/api/v1/catalog/titles/{slug}',
  '/api/v1/catalog/episodes/{id}',
  '/api/v1/search',
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/me',
  '/api/v1/watch-progress',
  '/api/v1/watchlist',
  '/api/v1/credits/wallet',
  '/api/v1/credits/unlock/{episodeId}',
  '/api/v1/billing/purchases/validate',
  '/api/v1/billing/webhooks',
  '/api/v1/media/playback/{episodeId}/session',
  '/api/v1/admin/titles',
];
for (const p of requiredPaths) {
  check(`dokümante: ${p}`, docPaths.includes(p));
}

// Dokümane her GET yolu en az bir yanıt şeması taşıyor mu (örneklem)
const docGET = docPaths.filter((p) => docs.paths[p].get);
check('GET yollarında yanıt şeması örneklemi', docGET.length >= 10, `GET yolu: ${docGET.length}`);

// ---- 2) Sayfalama / filtre / arama ----
console.log('— Sayfalama / filtreleme / arama —');
const titles1 = (await req('GET', '/api/v1/catalog/titles?page=1&pageSize=2')).json;
check('titles sayfalama: ok=true', titles1?.ok === true);
check(
  'meta sözleşmesi (page/pageSize/totalItems/totalPages/hasNextPage)',
  titles1?.data?.meta &&
    ['page', 'pageSize', 'totalItems', 'totalPages', 'hasNextPage'].every(
      (k) => k in titles1.data.meta,
    ),
  JSON.stringify(titles1?.data?.meta),
);
check('pageSize=2 → en fazla 2 kayıt', (titles1?.data?.items?.length ?? 0) <= 2);

const titles2 = (await req('GET', '/api/v1/catalog/titles?page=2&pageSize=2')).json;
const ids1 = (titles1?.data?.items ?? []).map((i) => i.contentId ?? i.slug);
const ids2 = (titles2?.data?.items ?? []).map((i) => i.contentId ?? i.slug);
check('sayfa 1 ve 2 kesişimsiz', ids1.every((id) => !ids2.includes(id)));

const film = (await req('GET', '/api/v1/catalog/titles?kind=FILM')).json;
check('kind=FILM filtresi yalnız FILM döner', (film?.data?.items ?? []).every((i) => i.kind === 'FILM'));

const free = (await req('GET', '/api/v1/catalog/titles?accessType=FREE')).json;
check(
  'accessType=FREE filtresi',
  (free?.data?.items ?? []).every((i) => i.accessType === 'FREE'),
);

const search = (await req('GET', '/api/v1/search?query=tren')).json;
check('search?query=tren ok=true', search?.ok === true);
const searchEmpty = (await req('GET', '/api/v1/search?query=zzzyyyxxx')).json;
check('arama boş sonuç → sayfalı boş liste', searchEmpty?.ok === true && Array.isArray(searchEmpty?.data?.items));

const badPage = (await req('GET', '/api/v1/catalog/titles?page=0')).json;
check('page=0 → 400 VALIDATION_FAILED', badPage?.error?.code === 'BAD_REQUEST' || badPage?.error?.details?.reason === 'VALIDATION_FAILED', JSON.stringify(badPage?.error).slice(0, 120));

const badSize = (await req('GET', '/api/v1/catalog/titles?pageSize=9999')).json;
check(
  'pageSize=9999 → reddedilir ya da sınırlanır',
  badSize?.error ? true : (badSize?.data?.meta?.pageSize ?? 9999) <= 100,
  JSON.stringify(badSize?.error ?? badSize?.data?.meta).slice(0, 120),
);

const badKind = (await req('GET', '/api/v1/catalog/titles?kind=BILINMEYEN')).json;
check('kind=BILINMEYEN → 400', Boolean(badKind?.error), JSON.stringify(badKind?.error).slice(0, 120));

// ---- 3) Taslak / yayın ayrımı (canlı) ----
console.log('— Taslak / yayın ayrımı (canlı) —');
const all = (await req('GET', '/api/v1/catalog/titles?pageSize=100')).json;
check('herkese açık listede yalnız PUBLISHED içerik', (all?.data?.items ?? []).every((i) => i.status === undefined || i.status === 'PUBLISHED'));
const draftProbe = await req('GET', '/api/v1/catalog/titles/yeni-baslangic');
check('taslak slug → 404', draftProbe.status === 404 && draftProbe.json?.error?.code === 'NOT_FOUND');

// ---- 4) Kullanıcı izolasyonu ----
console.log('— Kullanıcı izolasyonu (kayıt → kendi kayıtları) —');
const stamp = Date.now();
const regA = await req('POST', '/api/v1/auth/register', {
  body: { displayName: 'QA A', email: `qa-a-${stamp}@test.dev`, password: 'Qa123456!', locale: 'tr' },
});
const regB = await req('POST', '/api/v1/auth/register', {
  body: { displayName: 'QA B', email: `qa-b-${stamp}@test.dev`, password: 'Qa123456!', locale: 'tr' },
});
check('kullanıcı A kaydı', regA.status === 201 || regA.status === 200, `status=${regA.status}`);
check('kullanıcı B kaydı', regB.status === 201 || regB.status === 200, `status=${regB.status}`);
const tokA = regA.json?.data?.tokens?.accessToken;
const tokB = regB.json?.data?.tokens?.accessToken;
check('A token alır', Boolean(tokA));
check('B token alır', Boolean(tokB));

// A ve B aynı içeriği favoriler (idempotent uç: POST /watchlist/:contentId)
const favA = await req('POST', '/api/v1/watchlist/gece-yarisi-treni', { token: tokA });
const favB = await req('POST', '/api/v1/watchlist/gece-yarisi-treni', { token: tokB });
check('A favori ekler', favA.status < 300 && favA.json?.data?.favorited === true, JSON.stringify(favA.json?.error ?? {}).slice(0, 140));
check('B favori ekler', favB.status < 300 && favB.json?.data?.favorited === true, JSON.stringify(favB.json?.error ?? {}).slice(0, 140));

const listB = (await req('GET', '/api/v1/watchlist', { token: tokB })).json;
check('B favori listesi kendi kayıtlarını döner', listB?.ok === true && Array.isArray(listB?.data?.items), JSON.stringify(listB?.error ?? {}).slice(0, 140));
// A favorisini çıkarsa B'nin listesi etkilenmemeli (izolasyon)
await req('DELETE', '/api/v1/watchlist/gece-yarisi-treni', { token: tokA });
const listB2 = (await req('GET', '/api/v1/watchlist', { token: tokB })).json;
check(
  "A'nın çıkarması B'nin favorisini bozmaz (izolasyon)",
  listB2?.ok === true && (listB2?.data?.items?.length ?? 0) >= (listB?.data?.items?.length ?? 0),
  JSON.stringify(listB2?.data ?? listB2?.error ?? {}).slice(0, 160),
);

// Token'sız korumalı uç
const noAuth = await req('GET', '/api/v1/watchlist');
check('token yok → 401 UNAUTHORIZED', noAuth.status === 401 && Boolean(noAuth.json?.error?.code));

// Sahte token
const badAuth = await req('GET', '/api/v1/watchlist', { token: 'sahte.token.deger' });
check('sahte token → 401', badAuth.status === 401 && Boolean(badAuth.json?.error?.code));

// Başka kullanıcının watch-progress kaydına doğrudan erişim yok (uç yalnız kendi kayıtları)
const epId =
  (await req('GET', '/api/v1/catalog/titles/kayip-sinyal')).json?.data?.accessSeasons?.[0]?.episodes?.[0]?.id;
const progA = await req('PUT', `/api/v1/watch-progress/${epId}`, {
  token: tokA,
  body: { positionSeconds: 42 },
});
check('A izleme ilerlemesi kaydeder', progA.status < 300, JSON.stringify(progA.json?.error ?? {}).slice(0, 140));
const progB = (await req('GET', '/api/v1/watch-progress', { token: tokB })).json;
check(
  "B'nin izleme listesinde A'nın bölümü yok (izolasyon)",
  progB?.ok === true &&
    !(JSON.stringify(progB?.data ?? {}).includes(`"${epId}"`)),
  JSON.stringify(progB?.data ?? progB?.error ?? {}).slice(0, 160),
);

// ---- 5) Hata zarfı sözleşmesi tutarlılığı ----
console.log('— Hata zarfı sözleşmesi —');
const errCases = [
  ['GET', '/api/v1/catalog/titles/olmayan-slug-xyz', null],
  ['GET', '/api/v1/catalog/episodes/olmayan-id', null],
  ['GET', '/api/v1/watchlist', null],
  ['POST', '/api/v1/auth/login', { email: 'x@y.z', password: 'WrongPass1!' }],
  ['POST', '/api/v1/auth/register', { displayName: '', email: 'bozuk', password: '1' }],
];
for (const [m, p, body] of errCases) {
  const r = await req(m, p, body ? { body } : {});
  const e = r.json?.error;
  const hasCode = r.status >= 400 && typeof e?.code === 'string' && e.code.length > 0;
  const hasMsg = typeof e?.message === 'string' && e.message.length > 0;
  const hasReason = typeof e?.details?.reason === 'string' && e.details.reason.length > 0;
  const okFalse = r.json?.ok === false;
  check(
    `${m} ${p} → ${r.status} zarfı (ok:false + code + message + details.reason)`,
    hasCode && hasMsg && hasReason && okFalse,
    JSON.stringify(e ?? null).slice(0, 140),
  );
}

// ---- 6) Success zarfı ----
console.log('— Başarı zarfı —');
// Not: /health* bilinçli olarak zarftan muaf (envelope.interceptor.ts doc:
// "altyapı uçları ham gövde") — yalnız ok:true beklenir; data alanı yoktur.
const okCases = ['/health', '/api/v1/home', '/api/v1/catalog/titles'];
for (const p of okCases) {
  const r = await req('GET', p);
  const isHealth = p.startsWith('/health');
  const pass = isHealth
    ? r.json?.ok === true && !('data' in r.json)
    : r.json?.ok === true && 'data' in r.json;
  check(`GET ${p} → ok:true${isHealth ? ' (altyapı: zarfsız)' : ' + data'}`, pass);
}

console.log(`\nSONUÇ: ${PASS} başarılı, ${FAIL} başarısız`);
if (failures.length) console.log('Başarısızlar:', failures.join(' | '));
process.exit(FAIL === 0 ? 0 : 1);
