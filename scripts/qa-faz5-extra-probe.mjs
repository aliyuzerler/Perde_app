/**
 * FAZ 5 EK probe — katalog ve arama kabul maddelerinin genişletilmiş denetimi.
 * (qa-faz2c-catalog-probe.mjs'nin KAPAMADIĞI noktalar; tekrar etmez.)
 *
 * Kapsam:
 *   F5-01..05  Tam sayfalama yürüyüşü: titles / search / kategori / geçmiş / favoriler
 *              → mükerrer öğe YOK, yürünen toplam == meta.totalItems (eksik öğe YOK)
 *   F5-06      Kullanıcı izolasyonu: A'nın favorisi/geçmişi B'ye sızmaz;
 *              tek-kayıt ucu (GET /watch-progress/:episodeId) kullanıcı bazlı
 *   F5-07      Taslak/ARŞİV sızma denetimi NORMAL KULLANICI token'ıyla
 *              (detay 404 + aramada yok + listede yok)
 *   F5-08      Detay sezon/bölüm sayıları PostgreSQL ile çapraz doğrulama
 *   F5-09      Kategori listeleri tutarlılığı (her kategori sayfalı + zarf doğru)
 *
 * Gereksinim: çalışan API (3000) + migrate+seed dev PG (perdego).
 * Not: kayıt rate limiti 3/60s — tekrar koşumları arasında 60 sn bekleyin
 *      veya API'yi yeniden başlatın (limiter bellek içidir).
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const API = `${BASE}/api/v1`;
const OUTBOX = '/home/z/my-project/apps/api/.mail-outbox.jsonl';
const DB_URL = 'postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego';

const results = [];
let pass = 0;
let fail = 0;

function check(id, name, cond, extra = '') {
  const ok = Boolean(cond);
  if (ok) pass += 1; else fail += 1;
  results.push({ id, name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${id} ${name}${extra ? ` — ${extra}` : ''}`);
}

async function api(method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload;
  try { payload = await res.json(); } catch { payload = undefined; }
  return { status: res.status, body: payload };
}

async function login(email, password) {
  const { status, body } = await api('POST', '/auth/login', { body: { email, password } });
  if (status !== 201 || !body?.ok) throw new Error(`giriş başarısız (${email}): ${status}`);
  return body.data.tokens.accessToken;
}

/** Tam sayfalama yürüyüşü → { slugs, total, dupCount, metaTutarlı, ilkHata } */
async function walk(path, pageSize, extract, token) {
  const seen = [];
  let page = 1;
  let total = null;
  let metaTutarlı = true;
  let ilkHata = '';
  // NOT: path içindeki mevcut pageSize'i temizle — çift parametre qs dizisi üretir → NaN.
  const basePath = path.replace(/([&?])pageSize=[^&]*/, '$1').replace(/[&?]$/, '');
  for (;;) {
    const sep = basePath.includes('?') ? '&' : '?';
    const { status, body } = await api('GET', `${basePath}${sep}page=${page}&pageSize=${pageSize}`, { token });
    if (status !== 200 || !body?.ok) {
      metaTutarlı = false;
      ilkHata = `HTTP ${status} ${JSON.stringify(body?.error ?? body ?? {}).slice(0, 160)}`;
      break;
    }
    const d = body.data;
    const items = extract(d) ?? [];
    const m = d.meta ?? {};
    if (typeof m.totalItems !== 'number' || typeof m.page !== 'number') metaTutarlı = false;
    if (total === null) total = m.totalItems ?? null;
    if (total !== null && m.totalItems !== total) metaTutarlı = false;
    seen.push(...items);
    const lastPage = m.totalPages ?? Math.ceil((m.totalItems ?? 0) / (m.pageSize ?? pageSize));
    if (page >= lastPage || items.length === 0) break;
    page += 1;
    if (page > 60) { metaTutarlı = false; break; } // döngü emniyeti
  }
  const dupCount = seen.length - new Set(seen).size;
  return { seen, total, dupCount, metaTutarlı, ilkHata };
}

function lastTokenFor(email) {
  if (!existsSync(OUTBOX)) throw new Error(`outbox yok: ${OUTBOX}`);
  const lines = readFileSync(OUTBOX, 'utf8').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const rec = JSON.parse(lines[i]);
    if (rec.to === email && rec.text) {
      const m = rec.text.match(/token=([A-Za-z0-9_-]+)/);
      if (m) return m[1];
    }
  }
  throw new Error(`anahtar bulunamadı: ${email}`);
}

async function registerVerified(displayName, email, password = 'Qa123456!') {
  const reg = await api('POST', '/auth/register', {
    body: { displayName, email, password, locale: 'tr', acceptTerms: true },
  });
  if (reg.status !== 201) throw new Error(`kayıt başarısız ${email}: ${reg.status} ${JSON.stringify(reg.body?.error ?? {})}`);
  const token = lastTokenFor(email);
  const ver = await api('POST', '/auth/verify-email', { body: { token } });
  if (ver.status !== 201 && ver.status !== 200) throw new Error(`doğrulama başarısız ${email}: ${ver.status}`);
  return login(email, password);
}

console.log(`FAZ 5 ek probe → ${API}\n`);

// ---------------------------------------------------------------------------
// F5-01..05 — tam sayfalama yürüyüşleri (mükerrer / eksik öğe denetimi)
{
  // F5-01: titles
  const t = await walk('/catalog/titles', 3, (d) => (d.items ?? []).map((i) => i.slug));
  check('F5-01', 'titles tüm sayfalar: mükerrer yok + toplam tutar',
    t.dupCount === 0 && t.metaTutarlı && t.seen.length === t.total,
    `yürünen=${t.seen.length} total=${t.total} dup=${t.dupCount}`);

  // F5-02: search — sözleşme parametresi `query` (q değil); çoklu eşleşen geniş terim
  let s = await walk('/search?query=ge', 2, (d) => (d.items ?? []).map((i) => i.slug));
  if (s.total === null || s.total === 0) s = await walk('/search?query=a', 2, (d) => (d.items ?? []).map((i) => i.slug));
  check('F5-02', 'arama tüm sayfalar: mükerrer yok + toplam tutar',
    s.dupCount === 0 && s.metaTutarlı && s.seen.length === s.total,
    `yürünen=${s.seen.length} total=${s.total} dup=${s.dupCount}${s.ilkHata ? ` ilkHata=${s.ilkHata}` : ''}`);

  // F5-03: kategori içeriği — ilk iki kategori
  const cats = await api('GET', '/catalog/categories?pageSize=50');
  const catList = cats.body?.data?.items ?? [];
  let catOk = catList.length > 0;
  const catDetay = [];
  for (const c of catList.slice(0, 2)) {
    const w = await walk(`/catalog/categories/${c.slug}/titles`, 2, (d) => (d.items ?? []).map((i) => i.slug));
    catDetay.push(`${c.slug}: yürünen=${w.seen.length} total=${w.total} dup=${w.dupCount}`);
    if (!(w.dupCount === 0 && w.metaTutarlı && w.seen.length === w.total)) catOk = false;
  }
  check('F5-03', 'kategori tüm sayfalar: mükerrer yok + toplam tutar', catOk, catDetay.join(' | '));

  // F5-04: izleme geçmişi (viewer, seed geçmişi var)
  const viewerTok = await login('viewer@perdego.dev', 'Dev12345');
  const h = await walk('/watch-progress?scope=history', 2, (d) => (d.items ?? []).map((i) => `${i.episodeId}`), viewerTok);
  check('F5-04', 'geçmiş tüm sayfalar: mükerrer yok + toplam tutar',
    h.dupCount === 0 && h.metaTutarlı && h.seen.length === h.total,
    `yürünen=${h.seen.length} total=${h.total} dup=${h.dupCount}${h.ilkHata ? ` ilkHata=${h.ilkHata}` : ''}`);

  // F5-05: favoriler — önce bir favori ekle; liste sözleşmesi TAM LİSTEDİR
  // (favoritesListResponseSchema = { items }, sayfalama yok) → mükerrer denetimi tam listeyle.
  const titles1 = await api('GET', '/catalog/titles?pageSize=5');
  const firstSlug = (titles1.body?.data?.items ?? [])[0]?.slug;
  let firstId = null;
  if (firstSlug) {
    const det = await api('GET', `/catalog/titles/${firstSlug}`, { token: viewerTok });
    firstId = det.body?.data?.id ?? null;
    if (firstId) await api('POST', `/watchlist/${firstId}`, { token: viewerTok });
  }
  const wl = await api('GET', '/watchlist', { token: viewerTok });
  const wlItems = wl.body?.data?.items ?? [];
  const wlKeys = wlItems.map((i) => i.slug);
  const wlDup = wlKeys.length - new Set(wlKeys).size;
  const wIceriyor = firstId ? wlItems.some((i) => i.id === firstId || i.slug === firstSlug) : true;
  check('F5-05', 'favoriler: tam liste (meta sözleşme gereği yok) mükerrer yok + eklenen listede',
    wl.status === 200 && wlDup === 0 && wIceriyor,
    `öğe=${wlItems.length} dup=${wlDup} eklenenListede=${wIceriyor}`);
}

// ---------------------------------------------------------------------------
// F5-06 — kullanıcı izolasyonu (A'nın verisi B'ye sızmaz)
{
  const stamp = Date.now();
  const tokA = await registerVerified('QA Kullanıcı A', `qa5-a${stamp}@perdego.test`);
  const tokB = await registerVerified('QA Kullanıcı B', `qa5-b${stamp}@perdego.test`);

  const titles = await api('GET', '/catalog/titles?pageSize=10');
  const series = (titles.body?.data?.items ?? []).find((i) => i.kind === 'SERIES') ?? titles.body?.data?.items?.[0];
  // SÖZLEŞME NOTU: liste öğesi contentSummary → kimlik alanı contentId (id değil).
  const seriesId = series.contentId ?? series.id;
  const det = await api('GET', `/catalog/titles/${series.slug}`, { token: tokA });
  // SÖZLEŞME NOTU: detayda seasons[].episodes bilinçli boş gelir (grup haritası boş);
  // erişim kararlı bölüm satırları accessSeasons'tadır → bölüm kaynağı accessSeasons.
  const s1 = (det.body?.data?.accessSeasons ?? [])[0];
  const ep1 = (s1?.episodes ?? [])[0];
  check('F5-06a', 'izolasyon önkosulu: yayında bölüm bulundu',
    Boolean(ep1?.id), `${series.slug} S${s1?.seasonNumber}B${ep1?.episodeNumber ?? '?'}`);

  // A favori ekler + ilerleme kaydeder
  await api('POST', `/watchlist/${seriesId}`, { token: tokA });
  const put = await api('PUT', `/watch-progress/${ep1.id}`, {
    token: tokA, body: { positionSeconds: 42, completed: false },
  });
  check('F5-06b', "A'nın favorisi + ilerlemesi kaydedildi", put.status === 200 || put.status === 201);

  // B'nin listeleri boş olmalı (A'nın verisi sızmaz)
  const bWatch = await api('GET', '/watchlist?pageSize=50', { token: tokB });
  const bWatchItems = bWatch.body?.data?.items ?? [];
  const bHist = await api('GET', '/watch-progress?scope=history&pageSize=50', { token: tokB });
  const bHistItems = bHist.body?.data?.items ?? [];
  const bCont = await api('GET', '/watch-progress?scope=continue&pageSize=50', { token: tokB });
  const bContItems = bCont.body?.data?.items ?? [];
  const sızma = bWatchItems.some((i) => (i.contentId ?? i.id) === seriesId)
    || bHistItems.some((i) => i.episodeId === ep1.id)
    || bContItems.some((i) => i.episodeId === ep1.id);
  check('F5-06c', "B'nin listelerinde A'nın verisi YOK (watchlist/history/continue)",
    !sızma, `watchlist=${bWatchItems.length} history=${bHistItems.length} continue=${bContItems.length}`);

  // Tek-kayıt ucu: sözleşme gereği kaydı olmayan kullanıcı SIFIR DURUM alır
  // (404 değil) — ama mutlaka KENDİ boş durumu olmalı; A'nın pozisyonu sızmaz.
  const bSingle = await api('GET', `/watch-progress/${ep1.id}`, { token: tokB });
  const aSingle = await api('GET', `/watch-progress/${ep1.id}`, { token: tokA });
  const bSifirDurum = bSingle.status === 200 && bSingle.body?.data?.positionSeconds === 0
    && bSingle.body?.data?.completed === false && bSingle.body?.data?.lastWatchedAt === null;
  const aPozisyon = aSingle.body?.data?.positionSeconds;
  check('F5-06d', 'tek-kayıt ucu: A kendi pozisyonunu görür, B sıfır-durum alır (sızma yok)',
    aSingle.status === 200 && aPozisyon === 42 && bSifirDurum,
    `A=${aSingle.status} poz=${aPozisyon} | B=${bSingle.status} poz=${bSingle.body?.data?.positionSeconds} tamamlandı=${bSingle.body?.data?.completed}`);

  // B kendi favorisini ekleyebilir (kişisel liste gerçekten kişiye bağlı)
  const bAdd = await api('POST', `/watchlist/${seriesId}`, { token: tokB });
  const bList = await api('GET', '/watchlist?pageSize=50', { token: tokB });
  const bGorur = (bList.body?.data?.items ?? []).some((i) => (i.contentId ?? i.id) === seriesId || i.slug === series.slug);
  check('F5-06e', 'B kendi favorisini ekler ve yalnız kendi kaydını görür', bAdd.status === 201 && bGorur,
    `bAdd=${bAdd.status} bList=${bList.status} öge=${bList.body?.data?.items?.length} gorur=${bGorur}`);

  // A listesi hâlâ kendi kaydını içeriyor (satır kayması yok)
  const aList = await api('GET', '/watchlist?pageSize=50', { token: tokA });
  const aGorur = (aList.body?.data?.items ?? []).some((i) => (i.contentId ?? i.id) === seriesId || i.slug === series.slug);
  check('F5-06f', "A'nın listesi bozulmadı", aGorur,
    `aList=${aList.status} öge=${aList.body?.data?.items?.length} gorur=${aGorur} ${JSON.stringify(aList.body?.error ?? {}).slice(0, 120)}`);
}

// ---------------------------------------------------------------------------
// F5-07 — taslak/ARŞİV sızma denetimi NORMAL KULLANICI token'ıyla
{
  const viewerTok = await login('viewer@perdego.dev', 'Dev12345');
  const adminTok = await login('admin@perdego.dev', 'Admin12345');
  const slug = `qa5-gizli-${Date.now()}`;
  const created = await api('POST', '/admin/titles', {
    token: adminTok,
    body: {
      slug,
      kind: 'SHORT_FILM',
      titleTr: 'QA Gizli Yapım Faz5',
      titleEn: 'QA Hidden Title Faz5',
      synopsisTr: 'Taslak sızma denetimi için geçici yapım.',
      synopsisEn: 'Temporary title for leak audit.',
      releaseYear: 2026,
      accessType: 'FREE',
    },
  });
  const id = created.body?.data?.id;
  check('F5-07a', 'taslak oluşturuldu (admin)', created.status === 201 && Boolean(id));

  // TASLAK: normal kullanıcı — detay 404, aramada yok, listede yok, kategoride yok
  const dDetail = await api('GET', `/catalog/titles/${slug}`, { token: viewerTok });
  const dSearch = await api('GET', '/search?q=QA+Gizli+Yapim&pageSize=50');
  const dList = await api('GET', '/catalog/titles?pageSize=50');
  const dHome = await api('GET', '/home');
  const taslakSızma = dDetail.status !== 404
    || (dSearch.body?.data?.items ?? []).some((i) => i.slug === slug)
    || (dList.body?.data?.items ?? []).some((i) => i.slug === slug)
    || JSON.stringify(dHome.body?.data ?? {}).includes(slug);
  check('F5-07b', 'TASLAK: kullanıcıya detay/arama/liste/home sızma YOK',
    !taslakSızma, `detay=${dDetail.status}`);

  // PUBLISHED → görünür; ARŞİV → tekrar gizli
  await api('PATCH', `/admin/titles/${id}/status`, { token: adminTok, body: { status: 'PUBLISHED' } });
  const pDetail = await api('GET', `/catalog/titles/${slug}`, { token: viewerTok });
  await api('PATCH', `/admin/titles/${id}/status`, { token: adminTok, body: { status: 'ARCHIVED' } });
  const aDetail = await api('GET', `/catalog/titles/${slug}`, { token: viewerTok });
  const aSearch = await api('GET', '/search?q=QA+Gizli+Yapim&pageSize=50');
  const aList = await api('GET', '/catalog/titles?pageSize=50');
  const arsivSızma = aDetail.status !== 404
    || (aSearch.body?.data?.items ?? []).some((i) => i.slug === slug)
    || (aList.body?.data?.items ?? []).some((i) => i.slug === slug);
  check('F5-07c', 'ARŞİV: kullanıcıya detay/arama/liste sızma YOK (yayın dönemi görünürdü)',
    pDetail.status === 200 && !arsivSızma, `yayın=${pDetail.status} arşiv=${aDetail.status}`);
}

// ---------------------------------------------------------------------------
// F5-08 — detay sezon/bölüm sayıları PostgreSQL ile çapraz doğrulama
{
  const require = createRequire('/home/z/my-project/apps/api/package.json');
  const { Client } = require('pg');
  const titles = await api('GET', '/catalog/titles?kind=SERIES&pageSize=10');
  const series = (titles.body?.data?.items ?? []).filter((i) => i.kind === 'SERIES').slice(0, 2);
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  let okAll = series.length > 0;
  const detaylar = [];
  for (const s of series) {
    const det = await api('GET', `/catalog/titles/${s.slug}`);
    // Sözleşme: erişim kararlı bölüm satırları accessSeasons'ta
    const apiSeasons = det.body?.data?.accessSeasons ?? [];
    const q = await client.query(
      `SELECT s."seasonNumber" AS sn, count(e.id) AS eps
         FROM seasons s
         LEFT JOIN episodes e
           ON e."contentId" = s."contentId" AND e."seasonNumber" = s."seasonNumber"
          AND e.status = 'PUBLISHED'
          AND (e."publishedAt" IS NULL OR e."publishedAt" <= now())
        JOIN contents c ON c.id = s."contentId"
       WHERE c.slug = $1
       GROUP BY s."seasonNumber" ORDER BY s."seasonNumber"`, [s.slug]);
    const dbRows = q.rows;
    const uyum = apiSeasons.length === dbRows.length
      && apiSeasons.every((as, i) => Number(dbRows[i]?.sn) === as.seasonNumber
        && Number(dbRows[i]?.eps) === (as.episodes ?? []).length);
    detaylar.push(`${s.slug}: api=${apiSeasons.length} sezon db=${dbRows.length}`);
    if (!uyum) okAll = false;
  }
  await client.end();
  check('F5-08', 'detay sezon/bölüm sayıları DB ile birebir', okAll, detaylar.join(' | '));
}

// ---------------------------------------------------------------------------
// F5-09 — kategori listeleri: her kategori 200 + zarf/sayfa tutarlı
{
  const cats = await api('GET', '/catalog/categories?pageSize=50');
  const list = cats.body?.data?.items ?? [];
  let ok = list.length > 0;
  const detay = [];
  for (const c of list) {
    const cc = await api('GET', `/catalog/categories/${c.slug}/titles?pageSize=10`);
    const d = cc.body?.data;
    const tutarlı = cc.status === 200 && cc.body?.ok === true && Array.isArray(d?.items)
      && d.items.every((i) => i.slug);
    if (!tutarlı) ok = false;
    detay.push(`${c.slug}=${d?.meta?.totalItems ?? '?'}`);
  }
  check('F5-09', `kategori listeleri tutarlı (${list.length} kategori)`, ok, detay.join(','));
}

// ---------------------------------------------------------------------------
console.log(`\nFAZ 5 ek probe sonucu: ${pass} PASS, ${fail} FAIL (toplam ${pass + fail})`);
console.log(JSON.stringify({ pass, fail, results }, null, 2));
if (fail > 0) process.exitCode = 1;
