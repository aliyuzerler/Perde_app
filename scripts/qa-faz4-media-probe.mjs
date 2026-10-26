/**
 * FAZ 4 canlı probe — medya altyapısı uçtan uca doğrulaması.
 *
 * Çalışma şartı:
 *   - API çalışır durumda (scripts/qa-faz4-run-probes.sh başlatır/kapatır)
 *   - DB migrate + seed yapılmış (LOCAL örnek medya kayıtları READY)
 *   - scripts/generate-sample-media.sh çıktıları yerinde
 *   - MAIL_OUTBOX_FILE env (doğrulanmış kayıt akışı için)
 *
 * Kullanım: node scripts/qa-faz4-media-probe.mjs
 */
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:4571';
const API_ROOT = `${BASE}/api/v1`;
const OUTBOX = process.env.MAIL_OUTBOX_FILE ?? '/tmp/perdego-faz4-probe-mail.jsonl';

let passCount = 0;
let failCount = 0;
const failures = [];

function pass(name, detail = '') {
  passCount += 1;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  failCount += 1;
  failures.push({ name, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(method, urlPath, { token, body, headers, raw } = {}) {
  const requestHeaders = { Accept: 'application/json', ...(headers ?? {}) };
  if (body !== undefined && !raw) requestHeaders['Content-Type'] = 'application/json';
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_ROOT}${urlPath}`, {
    method,
    headers: requestHeaders,
    body: raw ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text, res };
}

async function login(email, password) {
  const { json } = await call('POST', '/auth/login', { body: { email, password } });
  if (!json?.ok) throw new Error(`login başarısız: ${email}`);
  return json.data.tokens.accessToken;
}

function lastVerifyToken(email) {
  const lines = readFileSync(OUTBOX, 'utf8').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const record = JSON.parse(lines[i]);
    if (record.to === email && record.text) {
      const match = record.text.match(/token=([A-Za-z0-9_-]+)/);
      if (match) return match[1];
    }
  }
  throw new Error(`doğrulama anahtarı bulunamadı: ${email}`);
}

async function registerVerified(displayName, email) {
  const reg = await call('POST', '/auth/register', {
    body: { displayName, email, password: 'Qa123456' },
  });
  if (reg.status !== 201) throw new Error(`register başarısız: ${reg.status}`);
  const token = lastVerifyToken(email);
  const verify = await call('POST', '/auth/verify-email', { body: { token } });
  if (verify.status !== 201) throw new Error('verify başarısız');
  return reg.json.data.tokens.accessToken;
}

async function firstEpisode(slug) {
  const { json } = await call('GET', `/catalog/titles/${slug}`);
  if (!json?.ok) throw new Error(`içerik bulunamadı: ${slug}`);
  return json.data;
}

/** Geçerli görünümlü MP4 gövdesi (ftyp magic byte). */
function fakeMp4(sizeBytes = 2048) {
  const header = Buffer.alloc(12);
  header.writeUInt32BE(0x18, 0);
  header.write('ftypisom', 4, 'latin1');
  return Buffer.concat([header, Buffer.alloc(sizeBytes, 0x07)]);
}

async function main() {
  console.log(`[faz4-probe] hedef: ${BASE}`);

  // 0) Sağlık + örnek paket varlığı
  const health = await fetch(`${BASE}/health`);
  health.status === 200
    ? pass('health 200')
    : fail('health 200', `status=${health.status}`);

  // 1) Konuk FREE oynatma oturumu
  const kayip = await firstEpisode('kayip-sinyal');
  const freeEp = kayip.accessSeasons[0].episodes[0].id;
  const guestSession = await call('POST', `/media/playback/${freeEp}/session`);
  const gs = guestSession.json?.data;
  guestSession.status === 201 && gs
    ? pass('konuk FREE oturum 201')
    : fail('konuk FREE oturum 201', `status=${guestSession.status} body=${guestSession.text.slice(0, 120)}`);
  gs?.provider === 'LOCAL' ? pass('provider=LOCAL') : fail('provider=LOCAL', String(gs?.provider));
  gs?.sources?.hls && gs?.sources?.mp4
    ? pass('sources hls+mp4 imzalı')
    : fail('sources hls+mp4 imzalı', JSON.stringify(gs?.sources ?? {}).slice(0, 120));
  gs?.guest === true ? pass('guest=true') : fail('guest=true');
  const trackLangs = (gs?.textTracks ?? []).map((t) => t.language).sort();
  JSON.stringify(trackLangs) === JSON.stringify(['en', 'tr'])
    ? pass('altyazı listesi tr+en')
    : fail('altyazı listesi tr+en', JSON.stringify(trackLangs));
  gs?.positionSeconds === 0 ? pass('positionSeconds=0 (misafir)') : fail('positionSeconds=0 (misafir)', String(gs?.positionSeconds));

  // 2) Manifest → imzalı segment/varyant/altyazı
  const manifestRes = await fetch(gs.sources.hls);
  const manifest = manifestRes.status === 200 ? await manifestRes.text() : '';
  manifestRes.status === 200 ? pass('master manifest 200') : fail('master manifest 200', String(manifestRes.status));
  const variantLine = manifest.split('\n').find((l) => l.includes('240p/playlist.m3u8') && !l.startsWith('#'));
  variantLine?.includes('token=') && variantLine?.includes(BASE)
    ? pass('varyant satırı imzalı mutlak URL')
    : fail('varyant satırı imzalı mutlak URL', variantLine ?? 'bulunamadı');
  const uriLine = manifest.split('\n').find((l) => l.includes('subtitles/tr.vtt') && l.includes('token='));
  uriLine ? pass('altyazı URI satırı imzalı') : fail('altyazı URI satırı imzalı');

  const variantRes = await fetch(variantLine);
  const variantText = variantRes.status === 200 ? await variantRes.text() : '';
  variantRes.status === 200 ? pass('varyant playlist 200') : fail('varyant playlist 200', String(variantRes.status));
  const segLine = variantText.split('\n').find((l) => l.includes('seg000.ts') && !l.startsWith('#'));
  const segRes = segLine ? await fetch(segLine) : null;
  segRes?.status === 200 && (segRes.headers.get('content-type') ?? '').includes('mp2t')
    ? pass('segment 200 video/mp2t')
    : fail('segment 200 video/mp2t', String(segRes?.status));
  const vttRes = await fetch(gs.textTracks.find((t) => t.language === 'tr').url);
  const vttText = vttRes.status === 200 ? await vttRes.text() : '';
  vttRes.status === 200 && vttText.includes('WEBVTT')
    ? pass('altyazı VTT 200')
    : fail('altyazı VTT 200', String(vttRes.status));

  // 3) MP4 + Range davranışları
  const mp4Full = await fetch(gs.sources.mp4);
  mp4Full.status === 200 && mp4Full.headers.get('accept-ranges') === 'bytes'
    ? pass('mp4 200 + accept-ranges')
    : fail('mp4 200 + accept-ranges', String(mp4Full.status));
  const mp4Range = await fetch(gs.sources.mp4, { headers: { Range: 'bytes=0-1023' } });
  mp4Range.status === 206 && (mp4Range.headers.get('content-range') ?? '').startsWith('bytes 0-1023/')
    ? pass('Range 206 + Content-Range')
    : fail('Range 206 + Content-Range', `${mp4Range.status} ${mp4Range.headers.get('content-range')}`);
  const mp4Suffix = await fetch(gs.sources.mp4, { headers: { Range: 'bytes=-512' } });
  const suffixRange = mp4Suffix.headers.get('content-range') ?? '';
  const suffixMatch = /bytes (\d+)-(\d+)\/(\d+)/.exec(suffixRange);
  const suffixOk =
    mp4Suffix.status === 206 &&
    suffixMatch !== null &&
    Number(suffixMatch[2]) === Number(suffixMatch[3]) - 1 && // son bayta kadar
    Number(suffixMatch[2]) - Number(suffixMatch[1]) + 1 === 512; // tam 512 bayt
  suffixOk
    ? pass('son-N bayt aralığı 206')
    : fail('son-N bayt aralığı 206', `${mp4Suffix.status} ${suffixRange}`);
  const mp4BadRange = await fetch(gs.sources.mp4, { headers: { Range: 'bytes=99999999-' } });
  mp4BadRange.status === 416 ? pass('geçersiz aralık 416') : fail('geçersiz aralık 416', String(mp4BadRange.status));

  // 4) İmza ihlalleri
  const tamperUrl = new URL(gs.sources.hls);
  tamperUrl.searchParams.set('token', 'saldiri-token-1234');
  const tampered = await fetch(tamperUrl);
  tampered.status === 403 ? pass('bozuk token → 403') : fail('bozuk token → 403', String(tampered.status));
  const expUrl = new URL(gs.sources.hls);
  expUrl.searchParams.set('exp', '1000000000');
  const wrongExp = await fetch(expUrl);
  wrongExp.status === 403 ? pass('uyumsuz exp → 403') : fail('uyumsuz exp → 403', String(wrongExp.status));

  // 5) Erişim kararları
  const sonVardiya = await firstEpisode('son-vardiya');
  const subEp = sonVardiya.accessSeasons[0].episodes.find((e) => e.accessType === 'SUBSCRIPTION');
  const guestDenied = await call('POST', `/media/playback/${subEp.id}/session`);
  guestDenied.status === 402 && guestDenied.json?.error?.details?.reason === 'NEEDS_SUBSCRIPTION'
    ? pass('konuk SUBSCRIPTION → 402')
    : fail('konuk SUBSCRIPTION → 402', `${guestDenied.status} ${guestDenied.text.slice(0, 100)}`);

  const gizli = await firstEpisode('gizli-bahce');
  const creditEp = gizli.accessSeasons[0].episodes[0].id;
  const guestCredit = await call('POST', `/media/playback/${creditEp}/session`);
  guestCredit.status === 402 && guestCredit.json?.error?.details?.reason === 'NEEDS_CREDITS'
    ? pass('konuk CREDIT → 402')
    : fail('konuk CREDIT → 402', `${guestCredit.status} ${guestCredit.text.slice(0, 100)}`);

  // DRAFT içerik bölümü → 404
  const draft = await call('GET', '/catalog/titles/yeni-baslangic');
  draft.status === 404 ? pass('DRAFT içerik → 404 (gizli)') : fail('DRAFT içerik → 404 (gizli)', String(draft.status));

  // 6) Kayıtlı kullanıcı akışı: abonelikle SUBSCRIPTION oturumu
  const email = `faz4-probe-${randomUUID().slice(0, 8)}@perdego.dev`;
  const userToken = await registerVerified('Faz 4 Probe', email);
  const userDenied = await call('POST', `/media/playback/${subEp.id}/session`, { token: userToken });
  userDenied.status === 402 ? pass('aboneliksiz üye → 402') : fail('aboneliksiz üye → 402', String(userDenied.status));
  const validate = await call('POST', '/billing/purchases/validate', {
    token: userToken,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { platform: 'IOS', productType: 'SUBSCRIPTION', productId: 'SUB_MONTHLY', storeTransactionId: `tx-${randomUUID().slice(0, 8)}` },
  });
  validate.status === 201 ? pass('mağaza doğrulama (simüle) 201') : fail('mağaza doğrulama (simüle) 201', String(validate.status));
  const userSession = await call('POST', `/media/playback/${subEp.id}/session`, { token: userToken });
  userSession.status === 201 ? pass('aboneli üye oturum 201') : fail('aboneli üye oturum 201', String(userSession.status));

  // İzleme ilerlemesi (oynatıcı akışının sunucu bacağı) — PUT 200 döner (Faz 2c davranışı)
  const progress = await call('PUT', `/watch-progress/${freeEp}`, {
    token: userToken,
    body: { positionSeconds: 7 },
  });
  progress.status === 200 && progress.json?.data?.saved === true
    ? pass('watch-progress kayıt 200')
    : fail('watch-progress kayıt 200', `${progress.status} ${progress.text.slice(0, 100)}`);
  const progressGet = await call('GET', `/watch-progress/${freeEp}`, { token: userToken });
  progressGet.json?.data?.positionSeconds === 7
    ? pass('watch-progress okuma — kaldığı yer')
    : fail('watch-progress okuma — kaldığı yer', progressGet.text.slice(0, 100));

  // 7) Yönetim yükleme akışı
  const adminToken = await login('admin@perdego.dev', 'Admin12345');
  const viewerToken = await login('viewer@perdego.dev', 'Dev12345');

  const roleDenied = await call('POST', `/admin/episodes/${freeEp}/media/upload-url`, { token: viewerToken, body: {} });
  roleDenied.status === 403 ? pass('upload-url role korumalı → 403') : fail('upload-url role korumalı → 403', String(roleDenied.status));

  const yanki = await firstEpisode('yanki');
  const yankiEp = yanki.accessSeasons[0].episodes[0].id;
  const ticket = await call('POST', `/admin/episodes/${yankiEp}/media/upload-url`, {
    token: adminToken,
    body: { originalName: 'probe-bolum.mp4', contentType: 'video/mp4' },
  });
  const tkt = ticket.json?.data;
  ticket.status === 201 && tkt?.method === 'PUT' && tkt?.uploadUrl?.includes('token=')
    ? pass('upload-url anahtarı (PUT + imzalı)')
    : fail('upload-url anahtarı (PUT + imzalı)', ticket.text.slice(0, 140));
  tkt?.maxSizeBytes > 0 ? pass('maxSizeBytes duyuruldu') : fail('maxSizeBytes duyuruldu');

  const before = await call('GET', `/admin/media/${tkt.mediaId}`, { token: adminToken });
  before.json?.data?.state === 'AWAITING_UPLOAD'
    ? pass('durum: AWAITING_UPLOAD')
    : fail('durum: AWAITING_UPLOAD', before.text.slice(0, 100));

  // Bozuk tokenlı PUT → 403
  const badPutUrl = new URL(tkt.uploadUrl);
  badPutUrl.searchParams.set('token', 'saldiri');
  const badPut = await fetch(badPutUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: fakeMp4(64) });
  badPut.status === 403 ? pass('bozuk token PUT → 403') : fail('bozuk token PUT → 403', String(badPut.status));

  // JSON gövdesi reddi (ham dosya gövdesi zorunlu)
  const jsonPut = await fetch(tkt.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });
  jsonPut.status === 400 ? pass('JSON gövdeli PUT → 400') : fail('JSON gövdeli PUT → 400', String(jsonPut.status));

  // Sahte mp4 → 400 UNSUPPORTED_MEDIA
  const fakePut = await fetch(tkt.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: Buffer.from('bu bir mp4 degil ---') });
  const fakeBody = await fakePut.text();
  fakePut.status === 400 && fakeBody.includes('UNSUPPORTED_MEDIA')
    ? pass('sahte dosya → 400 UNSUPPORTED_MEDIA')
    : fail('sahte dosya → 400 UNSUPPORTED_MEDIA', `${fakePut.status} ${fakeBody.slice(0, 120)}`);

  // Geçerli yükleme
  const okPut = await fetch(tkt.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: fakeMp4(4096) });
  const okData = okPut.status === 201 ? (await okPut.json())?.data : null;
  okPut.status === 201 && okData?.state === 'PROCESSING'
    ? pass('ham gövdeli PUT → 201 PROCESSING')
    : fail('ham gövdeli PUT → 201 PROCESSING', String(okPut.status));

  // İkinci yükleme → 409
  const againPut = await fetch(tkt.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: fakeMp4(64) });
  againPut.status === 409 ? pass('ikinci PUT → 409 (tek kullanım)') : fail('ikinci PUT → 409 (tek kullanım)', String(againPut.status));

  // sync → READY + tek-READY düşürme
  const sync1 = await call('POST', `/admin/media/${tkt.mediaId}/sync`, { token: adminToken });
  sync1.json?.data?.state === 'READY'
    ? pass('sync → READY (gecikmesiz)')
    : fail('sync → READY (gecikmesiz)', sync1.text.slice(0, 120));

  const mediaList = await call('GET', `/admin/episodes/${yankiEp}/media`, { token: adminToken });
  const readyRows = (mediaList.json?.data?.items ?? []).filter((m) => m.state === 'READY');
  const demoted = (mediaList.json?.data?.items ?? []).some(
    (m) => m.state === 'ERROR' && m.mediaId !== tkt.mediaId && (m.errorMessage ?? '').includes('Eski sürüm')
  );
  readyRows.length === 1 && readyRows[0].mediaId === tkt.mediaId
    ? pass('tek READY kuralı (yeni sürüm)')
    : fail('tek READY kuralı (yeni sürüm)', JSON.stringify(readyRows).slice(0, 120));
  demoted ? pass('eski sürüm ERROR ile düşürüldü') : fail('eski sürüm ERROR ile düşürüldü');

  // Yeni medya ile oynatma: yalnızca mp4
  const newSession = await call('POST', `/admin/episodes/${yankiEp}/media/upload-url`, { token: adminToken, body: {} });
  void newSession;
  const playNew = await call('POST', `/media/playback/${yankiEp}/session`);
  const playNewData = playNew.json?.data;
  playNew.status === 201 && playNewData?.sources?.mp4 && !playNewData?.sources?.hls
    ? pass('yüklenen medya: yalnızca mp4 kaynağı')
    : fail('yüklenen medya: yalnızca mp4 kaynağı', JSON.stringify(playNewData?.sources ?? {}).slice(0, 120));
  const upMp4 = playNewData ? await fetch(playNewData.sources.mp4) : null;
  upMp4?.status === 200 ? pass('yüklenen mp4 200') : fail('yüklenen mp4 200', String(upMp4?.status));
  const upTracks = (playNewData?.textTracks ?? []).length;
  upTracks > 0 ? pass('yüklenen akış demo altyazılı') : fail('yüklenen akış demo altyazılı', String(upTracks));

  // Medya listesi/status/delete
  const status = await call('GET', `/admin/media/${tkt.mediaId}`, { token: adminToken });
  status.json?.data?.playbackReady === true ? pass('status.playbackReady=true') : fail('status.playbackReady=true', status.text.slice(0, 100));
  const del = await call('DELETE', `/admin/media/${tkt.mediaId}`, { token: adminToken });
  del.json?.data?.deleted === true ? pass('medya silme') : fail('medya silme', del.text.slice(0, 100));

  // 8) Özet
  console.log('\n[faz4-probe] ÖZET');
  console.log(`  PASS: ${passCount}`);
  console.log(`  FAIL: ${failCount}`);
  if (failCount > 0) {
    console.log('  Başarısızlar:');
    for (const failure of failures) console.log(`   - ${failure.name}: ${failure.detail}`);
    process.exit(1);
  }
  console.log('  SONUÇ: TÜMÜ GEÇTİ');
}

const outboxReady = existsSync(OUTBOX);
if (!outboxReady) {
  mkdtempSync(path.join(tmpdir(), 'faz4-probe-')); // dokunma: outbox API tarafından yazılır
}
main().catch((error) => {
  console.error('[faz4-probe] beklenmeyen hata:', error);
  process.exit(1);
});
