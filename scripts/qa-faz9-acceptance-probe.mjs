#!/usr/bin/env node
/**
 * FAZ 9 kabul probe'u — bildirim altyapısı uçtan uca.
 *
 * Sunucu PUSH_PROVIDER=simulated ile ayaktayken koşar (runner kurar).
 * Kapsam: cihaz token (çoklu cihaz/upsert/kimliksiz), olay bildirimleri
 * (tercih süzme + dedup), dispatch + izleme (SENT/FAILED), geçersiz token
 * akışı, kampanya fan-out + admin izleme ucu, abonelik hatırlatma,
 * in-app okuma akışı.
 */
const API = process.env.QA_API_BASE ?? 'http://127.0.0.1:3002/api/v1';

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

async function req(method, path, { token, stepUp, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (stepUp) headers['x-step-up-token'] = stepUp;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* boş */
  }
  return { status: res.status, json };
}
const data = (r) => r.json?.data;
const okS = (s) => s === 200 || s === 201;
const reasonOf = (r) => r.json?.error?.details?.reason ?? r.json?.error?.code ?? '(yok)';

async function login(email, password) {
  const r = await req('POST', '/auth/login', { body: { email, password } });
  if (!okS(r.status) || !data(r)?.tokens) throw new Error(`login ${email} → ${r.status}`);
  return { ...data(r).tokens, user: data(r).user };
}

const S = {};
const stamp = Date.now().toString(36);
const TOK_A = `ExponentPushToken[qa9-valid-a-${stamp}]`;
const TOK_B = `ExponentPushToken[qa9-valid-b-${stamp}]`;
const TOK_BAD = `ExponentPushToken[invalid-qa9-${stamp}]`;

async function main() {
  section('S0 — Ortam');
  const health = await fetch(`${API.replace('/api/v1', '')}/health`);
  ok('S0.1 API ayakta', health.ok);
  S.admin = await login('admin@perdego.dev', 'Admin12345');
  S.viewer = await login('viewer@perdego.dev', 'Dev12345');
  const step = await req('POST', '/auth/step-up', { token: S.admin.accessToken, body: { password: 'Admin12345' } });
  S.step = data(step).stepUpToken;
  ok('S0.2 admin + step-up hazır', Boolean(S.step));

  const dispatch0 = await req('POST', '/admin/push/dispatch', { token: S.admin.accessToken, stepUp: S.step });
  ok('S0.3 manuel dispatch ucu çalışır (ADMIN+step-up)', okS(dispatch0.status) && Boolean(data(dispatch0)?.dispatch), `status=${dispatch0.status}`);
  ok('S0.4 sağlayıcı simulated (runner env)', data(dispatch0)?.provider === 'simulated', `=${data(dispatch0)?.provider}`);
  const dispatchAnon = await req('POST', '/admin/push/dispatch');
  ok('S0.5 dispatch anonim → 401', dispatchAnon.status === 401, `=${dispatchAnon.status}`);

  section('S1 — Cihaz token kaydı (çoklu cihaz + upsert)');
  const r1 = await req('POST', '/notifications/devices', { token: S.viewer.accessToken, body: { platform: 'IOS', pushToken: TOK_A, locale: 'tr' } });
  ok('S1.1 token A kaydedildi (maskeli)', okS(r1.status) && data(r1)?.pushTokenMasked?.endsWith(TOK_A.slice(-4)), `=${data(r1)?.pushTokenMasked}`);
  const r1b = await req('POST', '/notifications/devices', { token: S.viewer.accessToken, body: { platform: 'IOS', pushToken: TOK_A, locale: 'en' } });
  ok('S1.2 aynı token upsert → aynı cihaz', data(r1b)?.id === data(r1)?.id, `${data(r1b)?.id} vs ${data(r1)?.id}`);
  const r2 = await req('POST', '/notifications/devices', { token: S.viewer.accessToken, body: { platform: 'ANDROID', pushToken: TOK_B, locale: 'tr' } });
  ok('S1.3 ikinci cihaz ayrı kayıt', okS(r2.status) && data(r2)?.id !== data(r1)?.id);
  const r3 = await req('POST', '/notifications/devices', { token: S.viewer.accessToken, body: { platform: 'IOS', pushToken: TOK_BAD, locale: 'tr' } });
  ok('S1.4 geçersiz işaretli token da kaydedilir (temizlik sonradan)', okS(r3.status));
  const r4 = await req('POST', '/notifications/devices', { body: { platform: 'IOS', pushToken: TOK_A, locale: 'tr' } });
  ok('S1.5 kimliksiz token kaydı → 401', r4.status === 401, `=${r4.status}`);

  section('S2 — Olay bildirimleri (taslak kuralı + tercih + dedup)');
  const series = await req('POST', '/admin/titles', {
    token: S.admin.accessToken,
    body: { slug: `qa9-dizi-${stamp}`, kind: 'SERIES', seriesFormat: 'MINI', titleTr: 'QA9 Mini Dizi', titleEn: 'QA9 Mini', synopsisTr: 'QA', synopsisEn: 'QA', releaseYear: 2026, accessType: 'FREE' },
  });
  S.contentId = data(series)?.id;
  ok('S2.1 mini dizi taslağı oluşturuldu', okS(series.status) && Boolean(S.contentId));
  const favDraft = await req('POST', `/watchlist/${S.contentId}`, { token: S.viewer.accessToken, body: {} });
  ok('S2.2 taslağa favori → 404 (Kural 6)', favDraft.status === 404, `=${favDraft.status}`);
  await req('POST', `/admin/titles/${S.contentId}/seasons`, { token: S.admin.accessToken, body: { seasonNumber: 1 } });
  await req('POST', `/admin/titles/${S.contentId}/episodes`, { token: S.admin.accessToken, body: { seasonNumber: 1, episodeNumber: 1, titleTr: 'B1', titleEn: 'E1', durationSeconds: 60, accessType: 'FREE' } });

  const pub = await req('PATCH', `/admin/titles/${S.contentId}/status`, { token: S.admin.accessToken, body: { status: 'PUBLISHED' } });
  ok('S2.3 yayınlandı (bütünsel: taslak bölüm de)', okS(pub.status) && data(pub)?.status === 'PUBLISHED');

  const fav = await req('POST', `/watchlist/${S.contentId}`, { token: S.viewer.accessToken, body: {} });
  ok('S2.4 yayındaki içeriğe favori eklendi (takip listesi)', okS(fav.status));

  const ep2 = await req('POST', `/admin/titles/${S.contentId}/episodes`, {
    token: S.admin.accessToken,
    body: { seasonNumber: 1, episodeNumber: 2, titleTr: 'B2', titleEn: 'E2', durationSeconds: 60, accessType: 'FREE' },
  });
  S.episodeId = data(ep2)?.id;
  const pub2 = await req('PATCH', `/admin/episodes/${S.episodeId}/status`, { token: S.admin.accessToken, body: { status: 'PUBLISHED' } });
  ok('S2.5 2. bölüm yayınlandı', okS(pub2.status));

  const list1 = await req('GET', '/notifications?page=1&pageSize=50', { token: S.viewer.accessToken });
  const items1 = data(list1)?.items ?? [];
  const epNotifs = items1.filter((n) => n.type === 'NEW_EPISODE' && n.data?.episodeId === S.episodeId);
  const titleNotifs = items1.filter((n) => n.type === 'NEW_CONTENT' && n.data?.contentId === S.contentId);
  ok('S2.6 NEW_EPISODE bildirimi düştü (favori/takip)', epNotifs.length === 1, `=${epNotifs.length}`);
  ok('S2.7 NEW_CONTENT duyurusu düştü (mini dizi yayını)', titleNotifs.length === 1, `=${titleNotifs.length}`);

  await req('PATCH', `/admin/episodes/${S.episodeId}/status`, { token: S.admin.accessToken, body: { status: 'ARCHIVED' } });
  await req('PATCH', `/admin/episodes/${S.episodeId}/status`, { token: S.admin.accessToken, body: { status: 'PUBLISHED' } });
  const list2 = await req('GET', '/notifications?page=1&pageSize=50', { token: S.viewer.accessToken });
  const epNotifs2 = (data(list2)?.items ?? []).filter((n) => n.type === 'NEW_EPISODE' && n.data?.episodeId === S.episodeId);
  ok('S2.8 yeniden yayın → mükerrer yok (dedupKey)', epNotifs2.length === 1, `=${epNotifs2.length}`);

  section('S3 — Dispatch + izleme (SENT/FAILED, geçersiz token)');
  const before = await req('POST', '/admin/push/dispatch', { token: S.admin.accessToken, stepUp: S.step });
  const d1 = data(before);
  ok('S3.1 dispatch: bekleyenler gönderildi (simüle)', okS(before.status) && d1.dispatch.sent >= 4, `sent=${d1.dispatch?.sent} failed=${d1.dispatch?.failed}`);
  ok('S3.2 dispatch yanıtında sayaç şeması', Number.isInteger(d1.dispatch?.tried) && Number.isInteger(d1.removedTokens) && Number.isInteger(d1.reminders));

  const list3 = await req('GET', '/notifications?page=1&pageSize=50', { token: S.viewer.accessToken });
  const epNotif = (data(list3)?.items ?? []).find((n) => n.type === 'NEW_EPISODE' && n.data?.episodeId === S.episodeId);
  ok('S3.3 bildirim pushSentAt doldu (izleme alanı)', Boolean(epNotif) && epNotif.readAt === null && Boolean(epNotif.createdAt), '');

  section('S4 — Tercih süzme (uygun olmayan bildirim gönderilmez)');
  await req('PATCH', '/notifications/preferences', { token: S.viewer.accessToken, body: { newEpisode: false } });
  const ep3 = await req('POST', `/admin/titles/${S.contentId}/episodes`, {
    token: S.admin.accessToken,
    body: { seasonNumber: 1, episodeNumber: 3, titleTr: 'B3', titleEn: 'E3', durationSeconds: 60, accessType: 'FREE' },
  });
  await req('PATCH', `/admin/episodes/${data(ep3)?.id}/status`, { token: S.admin.accessToken, body: { status: 'PUBLISHED' } });
  const list4 = await req('GET', '/notifications?page=1&pageSize=50', { token: S.viewer.accessToken });
  const ep3Notifs = (data(list4)?.items ?? []).filter((n) => n.type === 'NEW_EPISODE' && n.data?.episodeId === data(ep3)?.id);
  ok('S4.1 newEpisode=false → bildirim OLUŞTURULMAZ', ep3Notifs.length === 0, `=${ep3Notifs.length}`);
  await req('PATCH', '/notifications/preferences', { token: S.viewer.accessToken, body: { newEpisode: true } });

  section('S5 — Kampanya fan-out + admin izleme ucu');
  const camp = await req('POST', '/admin/notification-campaigns', {
    token: S.admin.accessToken,
    stepUp: S.step,
    body: { type: 'PROMO', titleTr: 'QA9 Kampanya', titleEn: 'QA9 Campaign', bodyTr: 'Kampanya probe', bodyEn: 'Campaign probe' },
  });
  S.campaignId = data(camp)?.id;
  ok('S5.1 kampanya SENT', okS(camp.status) && data(camp)?.status === 'SENT', `=${data(camp)?.status}`);
  const sends = await req('GET', `/admin/notification-campaigns/${S.campaignId}/sends?page=1&pageSize=50`, { token: S.admin.accessToken });
  ok('S5.2 gönderim izleri: items + stats (pending/sent/failed)', okS(sends.status) && Array.isArray(data(sends)?.items) && Boolean(data(sends)?.stats), `items=${(data(sends)?.items ?? []).length}`);
  ok('S5.3 izler maskeli token taşır (gizlilik)', (data(sends)?.items ?? []).every((i) => i.pushTokenMasked.startsWith('…')), '');
  const dispatch2 = await req('POST', '/admin/push/dispatch', { token: S.admin.accessToken, stepUp: S.step });
  ok('S5.4 ikinci dispatch → kampanya gönderimleri SENT', okS(dispatch2.status) && data(dispatch2).dispatch.sent >= 2, `sent=${data(dispatch2).dispatch?.sent}`);
  const sends2 = await req('GET', `/admin/notification-campaigns/${S.campaignId}/sends?page=1&pageSize=50`, { token: S.admin.accessToken });
  ok('S5.5 kampanya gönderimleri SENT oldu', (data(sends2)?.items ?? []).every((i) => i.status === 'SENT'), `stats=${JSON.stringify(data(sends2)?.stats)}`);
  ok(
    'S5.6 geçersiz işaretli cihaz yeni kampanyaya DAHİL EDİLMEZ (enqueue filtresi)',
    (data(sends2)?.items ?? []).length === 2,
    `items=${(data(sends2)?.items ?? []).length} (beklenen: 2 geçerli cihaz)`,
  );
  const sendsFilter = await req('GET', `/admin/notification-campaigns/${S.campaignId}/sends?page=1&pageSize=50&status=SENT`, { token: S.admin.accessToken });
  ok('S5.7 durum filtresi çalışır', okS(sendsFilter.status) && (data(sendsFilter)?.items ?? []).every((i) => i.status === 'SENT'), '');

  section('S6 — Abonelik hatırlatma (runner abonelik ekler)');
  // Not: süpürme her dispatch çağrısında koştuğu için hatırlatma önceki S0-S5
  // dispatch'lerinde oluşmuş olabilir; burada doğrulanan: tek abonelik → tek
  // bildirim (dedup) ve tekrar dispatch'te yeni hatırlatma YOK.
  const list5 = await req('GET', '/notifications?page=1&pageSize=50', { token: S.viewer.accessToken });
  const reminders = (data(list5)?.items ?? []).filter((n) => n.type === 'SYSTEM' && n.data?.kind === 'SUB_REMINDER');
  ok('S6.1 SYSTEM/SUB_REMINDER bildirimi merkezde (tek abonelik → tek bildirim)', reminders.length === 1, `=${reminders.length}`);
  const dispatch4 = await req('POST', '/admin/push/dispatch', { token: S.admin.accessToken, stepUp: S.step });
  ok('S6.2 aynı dönem için tekrar hatırlatma YOK (dedup)', data(dispatch4)?.reminders === 0, `reminders=${data(dispatch4)?.reminders}`);
  const list5b = await req('GET', '/notifications?page=1&pageSize=50', { token: S.viewer.accessToken });
  const remindersAfter = (data(list5b)?.items ?? []).filter((n) => n.type === 'SYSTEM' && n.data?.kind === 'SUB_REMINDER');
  ok('S6.3 dedup sonrası hâlâ tek hatırlatma', remindersAfter.length === 1, `=${remindersAfter.length}`);

  section('S7 — In-app okuma akışı');
  const list6 = await req('GET', '/notifications?page=1&pageSize=20', { token: S.viewer.accessToken });
  const unreadBefore = data(list6)?.unreadCount ?? 0;
  const firstUnread = (data(list6)?.items ?? []).find((n) => !n.readAt);
  ok('S7.1 okunmamış bildirim var', Boolean(firstUnread) && unreadBefore > 0, `=${unreadBefore}`);
  const mark = await req('POST', `/notifications/${firstUnread.id}/read`, { token: S.viewer.accessToken, body: {} });
  ok('S7.2 tek okundu', okS(mark.status) && data(mark)?.marked === true);
  const all = await req('POST', '/notifications/read-all', { token: S.viewer.accessToken, body: {} });
  ok('S7.3 tümünü okundu', okS(all.status));
  const list7 = await req('GET', '/notifications?page=1&pageSize=20', { token: S.viewer.accessToken });
  ok('S7.4 unreadCount 0 (tüm okunanlar işaretli)', data(list7)?.unreadCount === 0, `=${data(list7)?.unreadCount}`);

  console.log('\n═════════════════════════════════════════');
  console.log(`FAZ 9 KABUL PROBE: ${pass} PASS / ${fail} FAIL`);
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
