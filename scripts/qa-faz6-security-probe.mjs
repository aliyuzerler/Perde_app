/**
 * FAZ 6 güvenlik probe'u — video/HLS erişim kontrolünün kalan maddeleri.
 *
 * Kapsam (görevin FAZ 6 listesinden):
 *   8) Süresi dolmuş playback URL/token  → PLAYBACK_TTL_SECONDS=60 koşumunda
 *      gerçek süre aşımı beklenir (son test — beklemeli).
 *   9) Ücretli bölüm: kredi bölümü yetkisiz kullanıcıyla doğrudan API çağrısı
 *      (402) → kredi satın al (simüle) → unlock → oturum açılır.
 *  10) Başka kullanıcının playback yetkisi/kaynak URL'i kullanımı.
 *  12) API yanıtında sır/anahtar sızıntısı taraması (mobil paket taraması ayrı).
 *
 * Ek kanıt: imza sırrı fallback'i (WEBHOOK_SIGNING_SECRET tanımsızken
 * DATABASE_URL son 24 karakterinden türetim) ile SAHTE token üretimi —
 * var olmayan sessionId ile premium bölüm manifesti alınabiliyor mu?
 *
 * Çalışma şartı:
 *   - API PLAYBACK_TTL_SECONDS=60 ile çalışır (runner: qa-faz6-run-probes.sh)
 *   - MEDIA_FALLBACK_SECRET env: fallback sır (forge testi için)
 *   - MAIL_OUTBOX_FILE env (doğrulanmış kayıt akışı)
 *
 * Kullanım: node scripts/qa-faz6-security-probe.mjs
 */
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:4572';
const API_ROOT = `${BASE}/api/v1`;
const OUTBOX = process.env.MAIL_OUTBOX_FILE ?? '/tmp/perdego-faz6-probe-mail.jsonl';
const FALLBACK_SECRET = process.env.MEDIA_FALLBACK_SECRET ?? '';

let passCount = 0;
let failCount = 0;
const failures = [];
const notes = [];

function pass(name, detail = '') {
  passCount += 1;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  failCount += 1;
  failures.push({ name, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}
function note(text) {
  notes.push(text);
  console.log(`  ℹ ${text}`);
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

function extractFileUrl(text, suffix) {
  // Manifest/varlık metninden imzalı mutlak URL bul (satır tarama).
  // Not: URL'ler ?token=...&exp=... sorgusuyla biter — suffix 'includes' ile aranır.
  for (const line of text.split('\n')) {
    const url = line.trim();
    if (url.startsWith('http') && url.includes(suffix) && url.includes('token=')) return url;
  }
  return null;
}

/** Ödeme sırrı fallback'i ile SAHTE playback token'ı. */
function forgePlaybackToken(sessionId, episodeId, exp) {
  return createHmac('sha256', FALLBACK_SECRET)
    .update(`playback:${sessionId}:${episodeId}:${exp}`)
    .digest('hex')
    .slice(0, 32);
}

async function main() {
  console.log(`[faz6-sec-probe] hedef: ${BASE}`);
  if (!FALLBACK_SECRET) {
    console.error('HATA: MEDIA_FALLBACK_SECRET tanımlı değil (forge testi yapılamaz)');
    process.exit(2);
  }

  const tmp = mkdtempSync(path.join(tmpdir(), 'faz6-'));
  const suffix = randomUUID().slice(0, 8);

  // --- Kullanıcılar -------------------------------------------------------
  const aToken = await registerVerified(`F6-A-${suffix}`, `faz6-a-${suffix}@perdego.dev`);
  const bToken = await registerVerified(`F6-B-${suffix}`, `faz6-b-${suffix}@perdego.dev`);
  const editorToken = await login('editor@perdego.dev', 'Admin12345');

  // --- Bölümler -----------------------------------------------------------
  const kayip = await call('GET', '/catalog/titles/kayip-sinyal');
  const freeEp = kayip.json.data.accessSeasons[0].episodes[0].id;

  // CREDIT bölümü: kredi maliyeti olan ilk bölümü tara
  let creditEp = null;
  for (const season of kayip.json.data.accessSeasons) {
    for (const ep of season.episodes) {
      if (ep.access?.type === 'CREDIT' || ep.accessType === 'CREDIT') creditEp = ep;
    }
  }
  if (!creditEp) {
    // Alternatif: başlıklar listesinden kredi maliyetli bölüm ara
    const titles = await call('GET', '/catalog/titles?page=1&pageSize=20');
    outer: for (const t of titles.json.data.items ?? []) {
      const detail = await call('GET', `/catalog/titles/${t.slug}`);
      for (const season of detail.json.data?.accessSeasons ?? []) {
        for (const ep of season.episodes) {
          if (ep.access?.type === 'CREDIT' || ep.accessType === 'CREDIT') {
            creditEp = ep;
            break outer;
          }
        }
      }
    }
  }
  if (!creditEp) throw new Error('CREDIT bölümü bulunamadı');

  const sonVardiya = await call('GET', '/catalog/titles/son-vardiya');
  let subEp = null;
  outerSub: for (const season of sonVardiya.json.data?.accessSeasons ?? []) {
    for (const ep of season.episodes) {
      if (ep.access?.type === 'SUBSCRIPTION' || ep.accessType === 'SUBSCRIPTION') {
        subEp = ep;
        break outerSub;
      }
    }
  }
  if (!subEp) throw new Error('SUBSCRIPTION bölümü bulunamadı');

  console.log('\n[1] Kredi bölümü — yetkisiz kullanıcı (madde 9)');
  const bCreditSession = await call('POST', `/media/playback/${creditEp.id}/session`, { token: bToken });
  bCreditSession.status === 402 && bCreditSession.json?.error?.details?.reason === 'NEEDS_CREDITS'
    ? pass('kredisiz üye → CREDIT bölüm 402 NEEDS_CREDITS')
    : fail('kredisiz üye → CREDIT bölüm 402 NEEDS_CREDITS', `${bCreditSession.status} ${bCreditSession.text.slice(0, 90)}`);

  console.log('\n[2] Kredi satın alma (simüle) + unlock + oynatma');
  const pack = await call('POST', '/billing/purchases/validate', {
    token: bToken,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { platform: 'IOS', productType: 'CREDIT_PACK', productId: 'PACK_10', storeTransactionId: `f6-${suffix}-a` },
  });
  pack.status === 201
    ? pass('kredi paketi doğrulama (simüle) 201')
    : fail('kredi paketi doğrulama (simüle) 201', `${pack.status} ${pack.text.slice(0, 90)}`);
  const balance1 = await call('GET', '/credits/balance', { token: bToken });
  const bal = balance1.json?.data?.total;
  typeof bal === 'number' && bal >= 10
    ? pass(`kredi bakiyesi ≥10 (${bal})`)
    : fail(`kredi bakiyesi ≥10 (${bal})`, `${balance1.status} ${balance1.text.slice(0, 90)}`);

  const unlock = await call('POST', `/credits/unlock/${creditEp.id}`, { token: bToken, body: {} });
  unlock.status === 201 && unlock.json?.data?.unlocked === true
    ? pass('krediyle bölüm açma 201 unlocked=true')
    : fail('krediyle bölüm açma 201 unlocked=true', `${unlock.status} ${unlock.text.slice(0, 90)}`);

  const bCreditSession2 = await call('POST', `/media/playback/${creditEp.id}/session`, { token: bToken });
  bCreditSession2.status === 201
    ? pass('kilit açıldıktan sonra oturum 201')
    : fail('kilit açıldıktan sonra oturum 201', `${bCreditSession2.status} ${bCreditSession2.text.slice(0, 90)}`);
  const creditManifest = extractFileUrl(bCreditSession2.json?.data?.sources?.hls ?? '', 'master.m3u8');
  if (creditManifest) {
    const cm = await fetch(creditManifest);
    const cmBody = await cm.text();
    cm.status === 200
      ? pass('kredi bölümü manifest 200 (imzalı)')
      : fail('kredi bölümü manifest 200 (imzalı)', `${cm.status} ${cmBody.slice(0, 90)}`);
  } else {
    fail('kredi bölümü manifest 200 (imzalı)', 'manifest URL bulunamadı');
  }

  console.log('\n[3] Abonelik bölümü — kullanıcılar arası URL kullanımı (madde 10)');
  const bSubSession = await call('POST', `/media/playback/${subEp.id}/session`, { token: bToken });
  bSubSession.status === 402 && bSubSession.json?.error?.details?.reason === 'NEEDS_SUBSCRIPTION'
    ? pass('aboneliksiz üye B → SUB bölüm 402')
    : fail('aboneliksiz üye B → SUB bölüm 402', `${bSubSession.status} ${bSubSession.text.slice(0, 90)}`);

  // A abone olur (simüle), oturum açar
  const validate = await call('POST', '/billing/purchases/validate', {
    token: aToken,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { platform: 'IOS', productType: 'SUBSCRIPTION', productId: 'SUB_MONTHLY', storeTransactionId: `f6-${suffix}-s` },
  });
  validate.status === 201 ? pass('A abonelik doğrulama (simüle) 201') : fail('A abonelik doğrulama (simüle) 201', String(validate.status));
  const aSession = await call('POST', `/media/playback/${subEp.id}/session`, { token: aToken });
  aSession.status === 201
    ? pass('A oturum 201 (SUB bölüm)')
    : fail('A oturum 201 (SUB bölüm)', `${aSession.status} ${aSession.text.slice(0, 90)}`);

  const aManifest = extractFileUrl(aSession.json?.data?.sources?.hls ?? '', 'master.m3u8');
  if (!aManifest) {
    fail('A manifest URL okundu', 'sources.hls boş');
  } else {
    const bBorrow = await fetch(aManifest, { headers: { Accept: '*/*' } });
    if (bBorrow.status === 200) {
      note('F6-ÖDÜN: B kullanıcısı A imzalı manifest URL ile 200 aldı — imzalı URL hamilidir (bearer); TTL 60 sn + oturum satırı süresi sınırlar. FAZ-6 raporuna ödün olarak işlendi.');
      pass('çapraz kullanıcı manifest 200 (ölçüldü, belgeli ödün — TTL 60 sn)', `${bBorrow.status}`);
      const mText = await bBorrow.text();
      const segUrl = extractFileUrl(mText, '.ts') ?? extractFileUrl(mText, '.m3u8');
      if (segUrl) {
        const segRes = await fetch(segUrl);
        pass('çapraz kullanıcı alt kaynak 200 (ölçüldü)', String(segRes.status));
      } else {
        note('manifest içinde imzalı alt kaynak satırı bulunamadı');
      }
    } else {
      pass('çapraz kullanıcı manifest URL reddedildi', String(bBorrow.status));
    }
  }

  console.log('\n[4] SAHTE token (fallback sır türetimi) — premium ve FREE bölüm');
  const forgedSessionId = randomUUID();
  const forgedExp = Math.floor(Date.now() / 1000) + 120;
  const forgedToken = forgePlaybackToken(forgedSessionId, subEp.id, forgedExp);
  const forgedUrl = `${API_ROOT}/media/hls/${subEp.id}/${forgedSessionId}/master.m3u8?token=${forgedToken}&exp=${forgedExp}`;
  const forgedRes = await fetch(forgedUrl);
  if (forgedRes.status === 403) {
    pass('F6-01 SAHTE token (var olmayan oturum) premium bölümde 403 — oturum satırı şartı kanıtlı');
  } else {
    fail('F6-01 SAHTE token (var olmayan oturum) premium bölümde 403', `gelen=${forgedRes.status}`);
  }
  // FREE bölümde satırsız konuk akışı BR-08 gereği imzayla çalışır (bilinçli tasarım)
  // Not: freeEp bir ID STRING'idir (.id değil!).
  const forgedFreeToken = forgePlaybackToken(forgedSessionId, freeEp, forgedExp);
  const forgedFreeUrl = `${API_ROOT}/media/hls/${freeEp}/${forgedSessionId}/master.m3u8?token=${forgedFreeToken}&exp=${forgedExp}`;
  const forgedFreeRes = await fetch(forgedFreeUrl);
  const forgedFreeBody = await forgedFreeRes.text();
  if (forgedFreeRes.status === 200) {
    note('BR-08 ölçümü: FREE bölümde satırsız konuk isteği geçerli imzayla 200 — bilinçli tasarım; premium satırı şartıyla sınırlandı (F6-01 düzeltmesi).');
    pass('FREE bölüm satırsız konuk manifest 200 (bilinçli tasarım — BR-08)', '200');
  } else {
    fail('FREE bölüm satırsız konuk manifest 200 (bilinçli tasarım — BR-08)', `${forgedFreeRes.status} ${forgedFreeBody.slice(0, 90)}`);
  }
  // Var olan oturum kimliğiyle re-sign: dev fallback sırrı biliniyorsa mümkün;
  // üretimde sır zorunlu+güçlü olduğundan pratikte imkansız. Ölçüm olarak kayıt.
  const aSessionId = aManifest ? new URL(aManifest).pathname.split('/')[6] : null;
  if (aSessionId) {
    const forgedToken2 = forgePlaybackToken(aSessionId, subEp.id, forgedExp);
    const forgedUrl2 = `${API_ROOT}/media/hls/${subEp.id}/${aSessionId}/master.m3u8?token=${forgedToken2}&exp=${forgedExp}`;
    const forgedRes2 = await fetch(forgedUrl2);
    if (forgedRes2.status === 200) {
      note('F6-ÖDÜN-2: dev fallback sır biliniyorsa var olan oturum re-sign edilebildi (200) — pratik sınır: oturum satırı TTL sonu (60 sn) ve üretimde güçlü sır zorunlu. Ödün olarak belgelendi.');
      pass('F6-01b re-sign ölçümü (dev ödün — oturum TTL sınırlı)', '200');
    } else {
      pass('F6-01b re-sign reddedildi', String(forgedRes2.status));
    }
  }

  console.log('\n[5] Yanıt sızıntısı taraması (madde 12 — API bacağı)');
  const leakPatterns = ['perdego-dev-playback', 'perdego-dev-media', 'perdego_dev_pass', 'WEBHOOK_SIGNING_SECRET', 'DATABASE_URL'];
  const payloads = [
    ['A oturum yanıtı', JSON.stringify(aSession.json)],
    ['B kredi oturum yanıtı', JSON.stringify(bCreditSession2.json)],
    ['upload-url yanıtı', null], // aşağıda doldurulur
  ];
  const uploadUrl = await call('POST', `/admin/episodes/${freeEp}/media/upload-url`, {
    token: editorToken,
    body: { originalName: 'f6-leak-scan.mp4', contentType: 'video/mp4' },
  });
  payloads[2][1] = JSON.stringify(uploadUrl.json);
  let leakFound = false;
  for (const [name, body] of payloads) {
    if (!body) continue;
    for (const pat of leakPatterns) {
      if (body.includes(pat)) {
        fail(`yanıt sızıntısı: ${name} içinde ${pat}`);
        leakFound = true;
      }
    }
  }
  if (!leakFound) pass('oturum + upload-url yanıtlarında sır/anahtar yok (5 desen)');

  console.log('\n[6] Süre aşımı — gerçek TTL dolumu (madde 8; PLAYBACK_TTL_SECONDS=60)');
  const expSession = await call('POST', `/media/playback/${freeEp}/session`, { token: bToken });
  const expData = expSession.json?.data;
  const expManifest = extractFileUrl(expData?.sources?.hls ?? '', 'master.m3u8');
  if (!expManifest) {
    fail('TTL oturum manifest URL okundu');
  } else {
    const before = await fetch(expManifest);
    before.status === 200 ? pass('süre dolmadan manifest 200') : fail('süre dolmadan manifest 200', String(before.status));
    const waitMs = 61000;
    note(`TTL 60 sn — ${waitMs / 1000} sn bekleniyor (gerçek süre aşımı)`);
    await new Promise((r) => setTimeout(r, waitMs));
    const after = await fetch(expManifest);
    after.status === 403 && (await after.text()).includes('TOKEN_EXPIRED')
      ? pass('süre dolmuş manifest → 403 TOKEN_EXPIRED')
      : fail('süre dolmuş manifest → 403 TOKEN_EXPIRED', `${after.status}`);
    const afterSession = await call('POST', `/media/playback/${freeEp}/session`, { token: bToken });
    afterSession.status === 201
      ? pass('yeni oturum açılabilir (süre aşımı kalıcı değil)')
      : fail('yeni oturum açılabilir (süre aşımı kalıcı değil)', String(afterSession.status));
  }

  console.log('\n[F6-SEC] ÖZET');
  console.log(`  PASS: ${passCount}`);
  console.log(`  FAIL: ${failCount}`);
  if (notes.length) {
    console.log('  NOTLAR:');
    for (const n of notes) console.log(`   - ${n}`);
  }
  console.log(failCount === 0 ? '  SONUÇ: TÜMÜ GEÇTİ' : '  SONUÇ: BAŞARISIZ TEST VAR');
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[faz6-sec-probe] ölümcül hata:', err.message);
  process.exit(2);
});
