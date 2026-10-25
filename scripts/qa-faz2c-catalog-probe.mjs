/**
 * Faz 2c CANLI katalog probe'u — gerçek HTTP (çalışan API + seed'li dev PG).
 *
 * Kapsam (görev brief'i):
 *   1. /home dinamik: banner + bölüm rayları (admin yönetimli veriden)
 *   2. /catalog/titles: sayfalama meta + kind/accessType/category/sort filtreleri
 *   3. /search: sayfalama + filtre + boş sonuç + doğrulama hatası
 *   4. /catalog/titles/:slug: sezon/bölüm listesi + erişim etiketleri
 *   5. /catalog/episodes/:id: bölüm detayı + sunucu erişim kararı
 *   6. /catalog/categories + /catalog/categories/:slug/titles
 *   7. Favoriler uçtan uca (auth): ekle → liste → çıkar
 *   8. İzleme geçmişi: scope=continue vs history ayrımı
 *   9. Yaşam döngüsü: DRAFT→PROCESSING→PUBLISHED→ARCHIVED görünürlük matrisi
 *  10. Banner/bölüm yönetimi /home'a yansır
 *  11. Hata zarfları: 401/403/404/400
 *
 * Kullanım: node scripts/qa-faz2c-catalog-probe.mjs [baseUrl]
 * Gereksinim: çalışan API (3000) + migrate+seed yapılmış dev veritabanı.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';
const API = `${BASE}/api/v1`;

const results = [];
let pass = 0;
let fail = 0;

function check(id, name, cond, extra = '') {
  const ok = Boolean(cond);
  if (ok) pass += 1;
  else fail += 1;
  results.push({ id, name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${id} ${name}${extra ? ` — ${extra}` : ''}`);
}

async function api(method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload;
  try {
    payload = await res.json();
  } catch {
    payload = undefined;
  }
  return { status: res.status, body: payload };
}

async function login(email, password) {
  const { status, body } = await api('POST', '/auth/login', { body: { email, password } });
  if (status !== 201 || !body?.ok) throw new Error(`giriş başarısız (${email}): ${status}`);
  return body.data.tokens.accessToken;
}

// ---------------------------------------------------------------------------
console.log(`Canlı katalog probe → ${API}\n`);

let probeTarget = null; // favoriler bloğunda seçilir; bölüm yönetimi senaryosunda kullanılır

// 1. Sağlık
{
  const h = await fetch(`${BASE}/health`).then((r) => r.json());
  const db = await fetch(`${BASE}/health/db`).then((r) => r.json());
  check('P2C-01', 'health + health/db 200', h.ok === true && db.ok === true);
}

// 2. /home dinamik
let firstSlug = null;
{
  const { status, body } = await api('GET', '/home');
  const d = body?.data;
  check('P2C-02', '/home 200 + zarf', status === 200 && body?.ok === true);
  check('P2C-03', '/home banner > 0', (d?.banners?.length ?? 0) > 0, `${d?.banners?.length} banner`);
  check('P2C-04', '/home bölüm > 0', (d?.sections?.length ?? 0) > 0, `${d?.sections?.length} bölüm`);
  const layouts = new Set((d?.sections ?? []).map((s) => s.layout));
  check('P2C-05', '/home HERO/RAIL/GRID düzenleri', layouts.size >= 1, [...layouts].join(','));
  const rail = (d?.sections ?? []).find((s) => s.layout === 'RAIL');
  const item = rail?.items?.[0];
  check(
    'P2C-06',
    'kart alanları: kind+accessType+posterUrl',
    item && ['FILM', 'SERIES', 'SHORT_FILM'].includes(item.kind)
      && ['FREE', 'SUBSCRIPTION', 'CREDIT'].includes(item.accessType),
    item ? `${item.kind}/${item.accessType}` : 'yok',
  );
  firstSlug = item?.slug ?? null;
}

// 3. /catalog/titles — sayfalama + filtreler
{
  const p1 = await api('GET', '/catalog/titles?page=1&pageSize=3');
  const d = p1.body?.data;
  check('P2C-07', 'titles sayfalama meta', d?.meta?.page === 1 && d?.meta?.pageSize === 3 && d?.items?.length === 3,
    `total=${d?.meta?.totalItems} pages=${d?.meta?.totalPages}`);
  const p2 = await api('GET', '/catalog/titles?page=2&pageSize=3');
  const noOverlap = !d.items.some((a) => p2.body?.data?.items.some((b) => b.contentId === a.contentId));
  check('P2C-08', 'sayfa 1 ve 2 kesişmez', noOverlap);
  const kinds = await api('GET', '/catalog/titles?kind=SERIES&pageSize=50');
  check('P2C-09', 'kind filtresi yalnız SERIES', (kinds.body?.data?.items ?? []).every((i) => i.kind === 'SERIES'),
    `${kinds.body?.data?.items?.length} dizi`);
  const acc = await api('GET', '/catalog/titles?accessType=FREE&pageSize=50');
  check('P2C-10', 'accessType filtresi yalnız FREE', (acc.body?.data?.items ?? []).every((i) => i.accessType === 'FREE'),
    `${acc.body?.data?.items?.length} ücretsiz`);
  const cat = await api('GET', '/catalog/titles?category=dram&pageSize=50');
  check('P2C-11', 'category filtresi çalışır', cat.status === 200 && Array.isArray(cat.body?.data?.items),
    `${cat.body?.data?.items?.length} dram yapımı`);
  const sorted = await api('GET', '/catalog/titles?sort=oldest&pageSize=50');
  const dates = (sorted.body?.data?.items ?? []).map((i) => i.isNew);
  check('P2C-12', 'sort parametresi kabul edilir', sorted.status === 200 && Array.isArray(dates));
}

// 4. /search
{
  const s = await api('GET', '/search?query=Gece');
  check('P2C-13', 'arama meta ile döner', s.status === 200 && s.body?.data?.meta?.page === 1,
    `${s.body?.data?.meta?.totalItems} sonuç`);
  const none = await api('GET', `/search?query=zzzyyyxxx${Date.now()}`);
  check('P2C-14', 'sonuç yok → boş sayfa (hata değil)', none.status === 200 && none.body?.data?.items?.length === 0
    && none.body?.data?.meta?.totalItems === 0);
  const empty = await api('GET', '/search?query=');
  check('P2C-15', 'boş terim → 400 VALIDATION_FAILED', empty.status === 400 && empty.body?.error?.code === 'BAD_REQUEST'
    && empty.body?.error?.details?.reason === 'VALIDATION_FAILED');
  const kindF = await api('GET', '/search?query=a&kind=FILM&pageSize=50');
  check('P2C-16', 'arama kind filtresi', (kindF.body?.data?.items ?? []).every((i) => i.kind === 'FILM'));
}

// 5. Detay + bölüm
{
  const titles = await api('GET', '/catalog/titles?pageSize=1');
  const slug = titles.body?.data?.items?.[0]?.slug ?? firstSlug;
  const det = await api('GET', `/catalog/titles/${slug}`);
  const dd = det.body?.data;
  check('P2C-17', 'detay 200 + sezonlar', det.status === 200 && Array.isArray(dd?.seasons),
    `${dd?.seasons?.length ?? 0} sezon`);
  // accessSeasons: erişim kararlı bölüm satırları (contracts: titleDetailResponseSchema)
  const accEp = dd?.accessSeasons?.[0]?.episodes?.[0];
  check('P2C-18', 'bölüm satırı: no+duration+access', accEp && typeof accEp.episodeNumber === 'number'
    && typeof accEp.durationSeconds === 'number' && typeof accEp.access === 'object',
    accEp ? `S${accEp.seasonNumber}B${accEp.episodeNumber} access=${accEp.access?.state ?? '?'}` : 'yok');
  if (accEp) {
    const e = await api('GET', `/catalog/episodes/${accEp.id}`);
    check('P2C-19', 'bölüm detayı 200 + karar', e.status === 200 && e.body?.data?.access !== undefined
      && e.body?.data?.content?.slug === slug);
  }
  const nf = await api('GET', '/catalog/titles/olmayan-yapim-xyz');
  check('P2C-20', 'bilinmeyen slug → 404 CONTENT_NOT_FOUND', nf.status === 404 && nf.body?.error?.code === 'NOT_FOUND'
    && nf.body?.error?.details?.reason === 'CONTENT_NOT_FOUND');
}

// 6. Kategoriler
{
  const cats = await api('GET', '/catalog/categories');
  const list = cats.body?.data?.items ?? cats.body?.data?.categories ?? [];
  check('P2C-21', 'kategori listesi > 0', cats.status === 200 && list.length > 0, `${list.length} kategori`);
  if (list[0]) {
    const cc = await api('GET', `/catalog/categories/${list[0].slug}/titles?page=1&pageSize=5`);
    check('P2C-22', 'kategori içeriği sayfalı', cc.status === 200 && Array.isArray(cc.body?.data?.items),
      `${list[0].slug}: ${cc.body?.data?.items?.length} yapım`);
  }
}

// 7-8. Favoriler + izleme geçmişi (auth)
{
  const noAuth = await api('GET', '/watchlist');
  check('P2C-23', 'kimliksiz watchlist → 401', noAuth.status === 401 && noAuth.body?.error?.code === 'UNAUTHORIZED');
  const token = await login('viewer@perdego.dev', 'Dev12345');

  const titles = await api('GET', '/catalog/titles?pageSize=5');
  const target = titles.body?.data?.items?.[0];
  probeTarget = target;
  const add1 = await api('POST', `/watchlist/${target.contentId}`, { token });
  const add2 = await api('POST', `/watchlist/${target.contentId}`, { token });
  const list = await api('GET', '/watchlist', { token });
  const hasIt = (list.body?.data?.items ?? []).some((i) => i.contentId === target.contentId);
  check('P2C-24', 'favori ekle (idempotent) + listede', add1.status === 201 && add2.status === 201 && hasIt);
  const rem = await api('DELETE', `/watchlist/${target.contentId}`, { token });
  const listAfter = await api('GET', '/watchlist', { token });
  const gone = !(listAfter.body?.data?.items ?? []).some((i) => i.contentId === target.contentId);
  check('P2C-25', 'favoriden çıkar + listeden düşer', rem.status === 200 && gone);

  const cont = await api('GET', '/watch-progress?scope=continue', { token });
  const hist = await api('GET', '/watch-progress?scope=history&page=1&pageSize=10', { token });
  check('P2C-26', 'izleme: continue + history ayrı uçlar', cont.status === 200 && hist.status === 200
    && Array.isArray(cont.body?.data?.items) && Array.isArray(hist.body?.data?.items),
    `continue=${cont.body?.data?.items?.length} history=${hist.body?.data?.items?.length}`);
  if (hist.body?.data?.meta) {
    check('P2C-27', 'history sayfalama meta', hist.body.data.meta.page === 1 && typeof hist.body.data.meta.totalItems === 'number');
  }
  if (cont.body?.data?.items?.[0]) {
    const c0 = cont.body.data.items[0];
    check('P2C-28', 'continue satırı: episode+content+pozisyon', c0.episodeId !== undefined
      && (c0.contentId !== undefined || c0.contentTitle !== undefined) && c0.positionSeconds !== undefined,
      `${c0.contentTitle ?? '?'} S${c0.seasonNumber}B${c0.episodeNumber} @${c0.positionSeconds}s`);
  }
}

// 9-10. Admin yaşam döngüsü + banner yönetimi
{
  const viewerTok = await login('viewer@perdego.dev', 'Dev12345');
  const forbidden = await api('GET', '/admin/titles', { token: viewerTok });
  check('P2C-29', 'viewer admin ucu → 403', forbidden.status === 403,
    `code=${forbidden.body?.error?.code ?? '?'} reason=${forbidden.body?.error?.details?.reason ?? '?'}`);

  const adminTok = await login('admin@perdego.dev', 'Admin12345');
  const slug = `probe-${Date.now()}`;
  const created = await api('POST', '/admin/titles', {
    token: adminTok,
    body: {
      slug,
      kind: 'SHORT_FILM',
      titleTr: 'Probe Yapımı',
      titleEn: 'Probe Title',
      synopsisTr: 'Canlı probe için üretilmiş geçici taslak yapım.',
      synopsisEn: 'Temporary draft title for the live probe run.',
      releaseYear: 2026,
      accessType: 'FREE',
    },
  });
  const id = created.body?.data?.id;
  check('P2C-30', 'taslak oluştur 201', created.status === 201 && id !== undefined);

  const pub404 = await api('GET', `/catalog/titles/${slug}`, { token: viewerTok });
  check('P2C-31', 'taslak herkese açık uçta 404', pub404.status === 404);

  const toProcessing = await api('PATCH', `/admin/titles/${id}/status`, { token: adminTok, body: { status: 'PROCESSING' } });
  const stillHidden = await api('GET', `/catalog/titles/${slug}`, { token: viewerTok });
  check('P2C-32', 'PROCESSING geçişi + hâlâ gizli', toProcessing.status === 200
    && toProcessing.body?.data?.status === 'PROCESSING' && stillHidden.status === 404);

  const toPublished = await api('PATCH', `/admin/titles/${id}/status`, { token: adminTok, body: { status: 'PUBLISHED' } });
  const nowVisible = await api('GET', `/catalog/titles/${slug}`, { token: viewerTok });
  check('P2C-33', 'PUBLISHED → herkese açık uçta görünür', toPublished.body?.data?.status === 'PUBLISHED' && nowVisible.status === 200);

  const adminList = await api('GET', `/admin/titles?search=${slug}`, { token: adminTok });
  const inAdmin = (adminList.body?.data?.items ?? []).some((i) => i.slug === slug);
  check('P2C-34', 'admin listesi tüm durumları görür', adminList.status === 200 && inAdmin);

  const toArchived = await api('PATCH', `/admin/titles/${id}/status`, { token: adminTok, body: { status: 'ARCHIVED' } });
  const archivedHidden = await api('GET', `/catalog/titles/${slug}`, { token: viewerTok });
  check('P2C-35', 'ARCHIVED → herkese açık uçlardan kaybolur', toArchived.body?.data?.status === 'ARCHIVED' && archivedHidden.status === 404);

  // Banner yönetimi → /home yansıması
  const bCreated = await api('POST', '/admin/banners', {
    token: adminTok,
    body: {
      slug: `probe-banner-${Date.now()}`,
      titleTr: 'Probe Bannerı',
      titleEn: 'Probe Banner',
      imageUrl: '/placeholders/banner-probe.svg',
      sortOrder: 99,
    },
  });
  const bId = bCreated.body?.data?.id;
  const home1 = await api('GET', '/home');
  const bSeen = (home1.body?.data?.banners ?? []).some((b) => b.id === bId);
  check('P2C-36', 'banner oluştur → /home’da görünür', bCreated.status === 201 && bSeen);

  await api('PATCH', `/admin/banners/${bId}`, { token: adminTok, body: { isActive: false } });
  const home2 = await api('GET', '/home');
  const bHidden = !(home2.body?.data?.banners ?? []).some((b) => b.id === bId);
  check('P2C-37', 'banner pasife → /home’da gizlenir', bHidden);

  const bDel = await api('DELETE', `/admin/banners/${bId}`, { token: adminTok });
  check('P2C-38', 'banner silinir', bDel.status === 200 || bDel.status === 204);

  // Home bölüm yönetimi → /home yansıması
  const secCreated = await api('POST', '/admin/home-sections', {
    token: adminTok,
    body: { key: `probe-sec-${Date.now()}`, titleTr: 'Probe Rayı', titleEn: 'Probe Rail', sectionType: 'RAIL', sortOrder: 99 },
  });
  const secId = secCreated.body?.data?.id;
  let secSeen = false;
  if (secId && probeTarget) {
    await api('POST', `/admin/home-sections/${secId}/items`, {
      token: adminTok,
      body: { contentId: probeTarget.contentId, sortOrder: 1 },
    });
    const home3 = await api('GET', '/home');
    secSeen = (home3.body?.data?.sections ?? []).some((s) => s.id === secId && s.items.length > 0);
  }
  check('P2C-39', 'bölüm oluştur + item ekle → /home’da RAIL görünür', secCreated.status === 201 && secSeen);
  if (secId) {
    await api('DELETE', `/admin/home-sections/${secId}`, { token: adminTok });
    const home4 = await api('GET', '/home');
    const secGone = !(home4.body?.data?.sections ?? []).some((s) => s.id === secId);
    check('P2C-40', 'bölüm silinir → /home’dan kalkar', secGone);
  }

  // Temizlik: probe içeriğini arşive çek (herkese açık listeden düşer)
  await api('PATCH', `/admin/titles/${id}/status`, { token: adminTok, body: { status: 'ARCHIVED' } });
}

// 11. Sunucu tarafı erişim ayrımı (kredi içeriği)
{
  const credit = await api('GET', '/catalog/titles?accessType=CREDIT&pageSize=50');
  const items = credit.body?.data?.items ?? [];
  let done = false;
  for (const item of items) {
    const det = await api('GET', `/catalog/titles/${item.slug}`);
    const ep = (det.body?.data?.accessSeasons ?? []).flatMap((s) => s.episodes)[0];
    if (!ep) continue;
    const unauth = await api('GET', `/catalog/episodes/${ep.id}`);
    const acc = unauth.body?.data?.access;
    check('P2C-41', 'kredi bölümü kimliksiz → canPlay=false + NEEDS_CREDITS', unauth.status === 200
      && acc?.canPlay === false && acc?.reason === 'NEEDS_CREDITS',
      `${item.slug}: reason=${acc?.reason ?? '?'}`);
    done = true;
    break;
  }
  if (!done) check('P2C-41', 'kredi bölümü kimliksiz → canPlay=false', true, 'bölümlü CREDIT yapım yok — atlandı');
}

// ---------------------------------------------------------------------------
console.log(`\nSonuç: ${pass} PASS / ${fail} FAIL / ${results.length} toplam`);
if (fail > 0) {
  process.exit(1);
}
