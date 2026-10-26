/**
 * FAZ 7 KABUL PROBE — Satın alma ve kredi güvenliği (QA).
 *
 * Üç sunucu yapılandırmasında koşar (runner betiği başlatır):
 *   A) BILLING_PROVIDER=none, NODE_ENV=test     → simülasyon + HMAC genel zarf
 *   B) BILLING_PROVIDER=revenuecat (test anahtarları), NODE_ENV=test → RC zarf yaşam döngüsü
 *   C) NODE_ENV=production (yalnızca yerel sandbox DB) → sahte başarı yasağı kanıtı
 *
 * Çıktı: her kontrol için [PASS]/[FAIL]/[WARN] + kanıt; sonda özet.
 * Çıkış kodu: FAIL varsa 1.
 */
const { createHmac } = require('node:crypto');

const base = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3199';
const phase = process.env.PROBE_PHASE ?? 'A';
const dbUrl = process.env.PROBE_DB_URL ?? '';
const hmacSecret = process.env.WEBHOOK_SIGNING_SECRET ?? 'faz7-qa-imza-sirri-0123456789';
const rcSecret = process.env.RC_WEBHOOK_SECRET ?? 'faz7-qa-rc-webhook-sirri-0123456789';
const stamp = Date.now();

const results = [];
function record(name, ok, evidence, warn = false) {
  results.push({ name, ok, warn, evidence });
  const tag = ok ? (warn ? '[WARN]' : '[PASS]') : '[FAIL]';
  console.log(`${tag} ${phase}-${name} — ${evidence}`);
}
async function check(name, fn) {
  try {
    const evidence = await fn();
    record(name, true, evidence);
  } catch (error) {
    record(name, false, error && error.message ? error.message : String(error));
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Anahtar sırasından bağımsız derin eşitlik (JSONB önbellek yanıtı anahtarları alfabetik döner). */
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v)
        .map(([k, val]) => [k, canonical(val)])
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return v;
}

async function call(method, path, { token, body, headers } = {}) {
  const h = { Accept: 'application/json', ...(headers ?? {}) };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = { raw: 'non-json' };
  }
  return { status: res.status, body: json };
}

function hmacSig(raw) {
  return `sha256=${createHmac('sha256', hmacSecret).update(raw).digest('hex')}`;
}

async function register(name) {
  const email = `faz7qa-${phase}-${name}-${stamp}@perdego.test`;
  const res = await call('POST', '/auth/register', {
    body: { displayName: `Faz7 QA ${name}`, email, password: 'Qa123456' },
  });
  assert(res.status === 201, `kayıt ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
  const token = res.body.data?.tokens?.accessToken ?? '';
  const userId = res.body.data?.user?.id ?? '';
  assert(token && userId, 'token/kullanıcı kimliği alınamadı');
  return { email, token, userId };
}

let dbClient = null;
async function db() {
  if (!dbClient) {
    const { Client } = require('pg');
    dbClient = new Client({ connectionString: dbUrl });
    await dbClient.connect();
  }
  return dbClient;
}

async function q(sql, params) {
  const client = await db();
  const res = await client.query(sql, params);
  return res.rows;
}

async function findEpisodes() {
  const creditRows = await q(
    `SELECT e.id, e."creditCost" AS cost FROM episodes e
     JOIN contents c ON c.id = e."contentId"
     WHERE e."accessType" = 'CREDIT' AND e."creditCost" IS NOT NULL
       AND c.status = 'PUBLISHED' AND e.status = 'PUBLISHED'
     ORDER BY e."creditCost" ASC`,
  );
  assert(creditRows.length >= 2, `yeterli CREDIT bölüm yok (${creditRows.length})`);
  const subRows = await q(
    `SELECT e.id FROM episodes e
     JOIN contents c ON c.id = e."contentId"
     WHERE e."accessType" = 'SUBSCRIPTION'
       AND c.status = 'PUBLISHED' AND e.status = 'PUBLISHED' LIMIT 1`,
  );
  assert(subRows.length >= 1, 'SUBSCRIPTION bölüm yok');
  return { credit: creditRows, sub: subRows[0].id };
}

async function wallet(token) {
  const res = await call('GET', '/credits/wallet', { token });
  assert(res.status === 200, `cüzdan ${res.status}`);
  return res.body.data?.wallet ?? {};
}

// ===========================================================================
// FAZ A — sağlayıcı yapılandırılmamış (none) + simülasyon + HMAC genel zarf
// ===========================================================================
const checksA = [
  () =>
    check('01-config-durum-urun-esleme', async () => {
      const res = await call('GET', '/billing/config');
      assert(res.status === 200, `config ${res.status}`);
      const d = res.body.data;
      assert(d.provider === 'none', `provider=${d.provider}`);
      assert(d.configured === false, 'configured=true olmamalı (sağlayıcı yok)');
      assert(
        d.subscriptionProducts.length >= 2 && d.creditPackProducts.length === 3,
        `ürün adet sub=${d.subscriptionProducts.length} pack=${d.creditPackProducts.length}`,
      );
      const monthly = d.subscriptionProducts.find((p) => p.planId === 'SUB_MONTHLY');
      const pack = d.creditPackProducts.find((p) => p.packId === 'PACK_10');
      assert(monthly?.productIds.ios === 'perdego.sub.monthly', 'iOS ürün kimliği eşleşmedi');
      assert(monthly?.productIds.android === 'perdego.sub.monthly', 'Google ürün kimliği eşleşmedi');
      assert(pack?.productIds.ios === 'perdego.pack.pack_10', 'paket iOS kimliği eşleşmedi');
      assert(pack?.productIds.android === 'perdego.pack.pack_10', 'paket Google kimliği eşleşmedi');
      return `provider=none, sub ürünler ${d.subscriptionProducts.length}, paketler ${d.creditPackProducts.length}, Apple/Google kimlikleri DB ile birebir`;
    }),
  () =>
    check('02-urun-fiyatlari-sunucudan', async () => {
      const res = await call('GET', '/billing/products');
      assert(res.status === 200, `products ${res.status}`);
      const plans = res.body.data?.plans ?? [];
      const packs = res.body.data?.packs ?? [];
      assert(plans.length >= 2 && packs.length === 3, 'plan/paket adedi');
      assert(plans.every((p) => p.priceKurus > 0), 'plan fiyatı 0');
      assert(packs.every((p) => p.priceKurus > 0), 'paket fiyatı 0');
      return `planlar ${plans.map((p) => `${p.id}=${p.priceKurus}kr`).join(', ')} (fiyat sunucu DB'sinden)`;
    }),
  () =>
    check('03-kredi-paketi-dogrulama-bakiye', async () => {
      const u = await register('cred');
      const res = await call('POST', '/billing/purchases/validate', {
        token: u.token,
        headers: { 'Idempotency-Key': `qa-a03-${stamp}` },
        body: {
          platform: 'IOS',
          productType: 'CREDIT_PACK',
          productId: 'perdego.pack.pack_10',
          storeTransactionId: `qa_a03_tx_${stamp}`,
        },
      });
      assert(res.status === 201, `validate ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
      assert(res.body.data.alreadyProcessed === false, 'ilk işlem alreadyProcessed=true');
      assert(res.body.data.wallet.purchased === 10, `bakiye ${res.body.data.wallet.purchased} ≠ 10`);
      const w = await wallet(u.token);
      assert(w.purchasedCredits === 10, `cüzdan ${w.purchasedCredits} ≠ 10`);
      return 'PACK_10 → 10 kredi, cüzdan doğru';
    }),
  () =>
    check('04-ledger-purchase-yazimi', async () => {
      const rows = await q(
        `SELECT type, "purchasedDelta" AS d, "expiresAt" AS exp FROM credit_ledger WHERE "idempotencyKey" = $1`,
        [`purchase:IOS:qa_a03_tx_${stamp}`],
      );
      assert(rows.length === 1, `PURCHASE ledger satır ${rows.length}`);
      assert(rows[0].type === 'PURCHASE' && rows[0].d === 10, 'ledger içerik hatalı');
      assert(rows[0].exp === null, 'satın alınan kredi expires_at null olmalı (süresiz)');
      return 'PURCHASE +10, expires_at=NULL (süresiz bakiye)';
    }),
  () =>
    check('05-idempotency-key-tekrari-ayni-yanit', async () => {
      const u = await register('idem');
      const body = {
        platform: 'IOS',
        productType: 'CREDIT_PACK',
        productId: 'perdego.pack.pack_10',
        storeTransactionId: `qa_a05_tx_${stamp}`,
      };
      const first = await call('POST', '/billing/purchases/validate', {
        token: u.token,
        headers: { 'Idempotency-Key': `qa-a05-${stamp}` },
        body,
      });
      const replay = await call('POST', '/billing/purchases/validate', {
        token: u.token,
        headers: { 'Idempotency-Key': `qa-a05-${stamp}` },
        body,
      });
      assert(first.status === 201 && replay.status === 201, `durum ${first.status}/${replay.status}`);
      assert(
        JSON.stringify(canonical(replay.body.data)) === JSON.stringify(canonical(first.body.data)),
        `önbellek yanıtı ilk yanıtla anlamsal olarak aynı değil: ${JSON.stringify(replay.body.data).slice(0, 160)}`,
      );
      const w = await wallet(u.token);
      assert(w.purchasedCredits === 10, `tekrarda bakiye ${w.purchasedCredits} ≠ 10`);
      return 'aynı Idempotency-Key → birebir aynı yanıt, bakiye tek eklendi';
    }),
  () =>
    check('06-ayni-store-tx-iki-kez-islenmez', async () => {
      const u = await register('duptx');
      const body = {
        platform: 'ANDROID',
        productType: 'CREDIT_PACK',
        productId: 'perdego.pack.pack_10',
        storeTransactionId: `qa_a06_tx_${stamp}`,
      };
      const first = await call('POST', '/billing/purchases/validate', {
        token: u.token,
        headers: { 'Idempotency-Key': `qa-a06-1-${stamp}` },
        body,
      });
      assert(first.status === 201, `ilk ${first.status}`);
      const dup = await call('POST', '/billing/purchases/validate', {
        token: u.token,
        headers: { 'Idempotency-Key': `qa-a06-2-${stamp}` },
        body,
      });
      assert(dup.status === 201, `tekrar ${dup.status}`);
      assert(dup.body.data.alreadyProcessed === true, 'alreadyProcessed=true beklenir');
      assert(dup.body.data.wallet.purchased === 10, 'bakiye ikinci kez arttı!');
      const ledger = await q(
        `SELECT COUNT(*)::int AS n FROM credit_ledger WHERE "idempotencyKey" = $1`,
        [`purchase:ANDROID:qa_a06_tx_${stamp}`],
      );
      assert(ledger[0].n === 1, `PURCHASE ledger ${ledger[0].n} satır (1 olmalı)`);
      return 'UNIQUE(platform,tx) tekrarı yakaladı, tek ledger satırı';
    }),
  () =>
    check('07-baska-kullanicinin-tx-hirsizligi', async () => {
      const u = await register('hirsiz');
      const res = await call('POST', '/billing/purchases/validate', {
        token: u.token,
        headers: { 'Idempotency-Key': `qa-a07-${stamp}` },
        body: {
          platform: 'IOS',
          productType: 'CREDIT_PACK',
          productId: 'perdego.pack.pack_10',
          storeTransactionId: `qa_a03_tx_${stamp}`, // başka kullanıcıya ait işlenmiş tx
        },
      });
      const w = await wallet(u.token);
      assert(
        w.purchasedCredits === 0,
        `başkasının işlemiyle kredi geldi: ${w.purchasedCredits}`,
      );
      return "hırsızın kendi cüzdanı: 'yeni kredi yok' — başka kullanıcının işlemi kredi vermez";
    }),
  () =>
    check('08-istemci-fiyat-kredi-beyani-guvenilmez', async () => {
      const u = await register('fiyat');
      const res = await call('POST', '/billing/purchases/validate', {
        token: u.token,
        headers: { 'Idempotency-Key': `qa-a08-${stamp}` },
        body: {
          platform: 'IOS',
          productType: 'CREDIT_PACK',
          productId: 'perdego.pack.pack_10',
          storeTransactionId: `qa_a08_tx_${stamp}`,
          priceKurus: 1,
          currency: 'TRY',
        },
      });
      assert(res.status === 201, `validate ${res.status}`);
      assert(res.body.data.wallet.purchased === 10, `istemci fiyatıyla kredi değişti: ${res.body.data.wallet.purchased}`);
      const txRows = await q(
        `SELECT "priceKurus" AS p FROM store_transactions WHERE "storeTransactionId" = $1`,
        [`qa_a08_tx_${stamp}`],
      );
      return `istemci priceKurus=1 dedi; kredi DB'den +10, işlem kaydı priceKurus=${txRows[0]?.p} (metadata, hak bakiyeyi etkilemez)`;
    }),
  () =>
    check('09-bilinmeyen-urun-reddedilir', async () => {
      const u = await register('sahteurun');
      const res = await call('POST', '/billing/purchases/validate', {
        token: u.token,
        headers: { 'Idempotency-Key': `qa-a09-${stamp}` },
        body: {
          platform: 'IOS',
          productType: 'CREDIT_PACK',
          productId: 'perdego.pack.sahte_pak_99999',
          storeTransactionId: `qa_a09_tx_${stamp}`,
        },
      });
      assert(res.status === 400 || res.status === 404, `sahte ürün ${res.status} ile kabul edildi`);
      const w = await wallet(u.token);
      assert(w.purchasedCredits === 0, 'sahte üründen kredi geldi!');
      return `sahte ürün → ${res.status} ${res.body.error?.code}, kredi verilmedi`;
    }),
  () =>
    check('10-idempotency-key-zorunlu', async () => {
      const u = await register('nokey');
      const res = await call('POST', '/billing/purchases/validate', {
        token: u.token,
        body: {
          platform: 'IOS',
          productType: 'CREDIT_PACK',
          productId: 'perdego.pack.pack_10',
          storeTransactionId: `qa_a10_tx_${stamp}`,
        },
      });
      assert(res.status === 400, `Idempotency-Key'siz ${res.status} kabul`);
      return 'Idempotency-Key olmadan 400 (BR-06)';
    }),
  () =>
    check('11-kreditsiz-unlock-402', async () => {
      const u = await register('kreditsiz');
      const eps = await findEpisodes();
      const res = await call('POST', `/credits/unlock/${eps.credit[0].id}`, { token: u.token, body: {} });
      assert(res.status === 402, `kreditsiz unlock ${res.status} (402 beklenir)`);
      assert(res.body.error?.details?.reason === 'INSUFFICIENT_CREDITS', `reason=${res.body.error?.details?.reason}`);
      return `402 INSUFFICIENT_CREDITS (bakiye=0, maliyet=${eps.credit[0].cost}) — doğrulanmamış işlemle kredi/hak verilmedi`;
    }),
  () =>
    check('12-unlock-dogru-maliyet-ve-ikinci-acma', async () => {
      const u = await register('unlock');
      await call('POST', '/billing/purchases/validate', {
        token: u.token,
        headers: { 'Idempotency-Key': `qa-a12-${stamp}` },
        body: {
          platform: 'IOS',
          productType: 'CREDIT_PACK',
          productId: 'perdego.pack.pack_10',
          storeTransactionId: `qa_a12_tx_${stamp}`,
        },
      });
      const eps = await findEpisodes();
      const cost = eps.credit[0].cost;
      const first = await call('POST', `/credits/unlock/${eps.credit[0].id}`, { token: u.token, body: {} });
      assert(first.status === 201, `unlock ${first.status}`);
      assert(first.body.data.balance.total === 10 - cost, `bakiye ${first.body.data.balance.total} ≠ ${10 - cost}`);
      const second = await call('POST', `/credits/unlock/${eps.credit[0].id}`, { token: u.token, body: {} });
      assert(second.body.data.alreadyUnlocked === true, 'ikinci açma alreadyUnlocked değil');
      assert(second.body.data.balance.total === 10 - cost, 'ikinci açmada bakiye değişti!');
      const ledger = await q(
        `SELECT COUNT(*)::int AS n FROM credit_ledger WHERE "idempotencyKey" = $1`,
        [`unlock:${u.userId}:${eps.credit[0].id}`],
      );
      assert(ledger[0].n === 1, `UNLOCK_SPEND ${ledger[0].n} satır`);
      return `maliyet ${cost} düşüldü (${10-cost} kaldı), ikinci açma ek kredi düşmedi, tek ledger satırı`;
    }),
  () =>
    check('13-eszamanli-iki-unlock-atomik', async () => {
      const u = await register('race');
      await call('POST', '/billing/purchases/validate', {
        token: u.token,
        headers: { 'Idempotency-Key': `qa-a13-${stamp}` },
        body: {
          platform: 'IOS',
          productType: 'CREDIT_PACK',
          productId: 'perdego.pack.pack_10',
          storeTransactionId: `qa_a13_tx_${stamp}`,
        },
      });
      const eps = await findEpisodes();
      const ep = eps.credit[1];
      const cost = ep.cost;
      const [r1, r2] = await Promise.all([
        call('POST', `/credits/unlock/${ep.id}`, { token: u.token, body: {} }),
        call('POST', `/credits/unlock/${ep.id}`, { token: u.token, body: {} }),
      ]);
      const statuses = [r1.status, r2.status].sort();
      const okWin = statuses.filter((s) => s === 201).length >= 1;
      assert(okWin, `iki istek de başarısız: ${statuses}`);
      for (const r of [r1, r2]) {
        if (r.status === 201) continue;
        assert(r.status === 409, `paralel kaybeden beklenmedik durum: ${r.status}`);
      }
      const w = await wallet(u.token);
      assert(w.purchasedCredits === 10 - cost, `yarış sonrası bakiye ${w.purchasedCredits} ≠ ${10 - cost}`);
      const ledger = await q(
        `SELECT COUNT(*)::int AS n FROM credit_ledger WHERE "idempotencyKey" = $1`,
        [`unlock:${u.userId}:${ep.id}`],
      );
      assert(ledger[0].n === 1, `yarışta ${ledger[0].n} UNLOCK_SPEND (1 olmalı)`);
      return `paralel 2 istek [${r1.status},${r2.status}] → tek harcama, bakiye ${w.purchasedCredits} (FOR UPDATE kilidi)`;
    }),
  () =>
    check('14-imzasiz-ve-yanlis-imzali-webhook-reddi', async () => {
      const payload = {
        source: 'REVENUECAT',
        eventId: `qa-a14-${stamp}`,
        eventType: 'CREDIT_PACK_PURCHASED',
        payload: {
          userId: 'x', userEmail: 'x@x.test', productId: 'PACK_10', platform: 'IOS',
          storeTransactionId: `qa_a14_tx_${stamp}`,
        },
      };
      const noSig = await call('POST', '/billing/webhooks', { body: payload });
      assert(noSig.body.data?.state === 'SKIPPED', `imzasız state=${noSig.body.data?.state}`);
      const badSig = await call('POST', '/billing/webhooks', {
        headers: { 'X-PerdeGo-Signature': 'sha256=deadbeef' },
        body: { ...payload, eventId: `qa-a14b-${stamp}` },
      });
      assert(badSig.body.data?.state === 'SKIPPED', `yanlış imza state=${badSig.body.data?.state}`);
      const rows = await q(
        `SELECT COUNT(*)::int AS n FROM webhook_events WHERE "eventId" IN ($1, $2) AND state = 'SKIPPED'`,
        [`qa-a14-${stamp}`, `qa-a14b-${stamp}`],
      );
      assert(rows[0].n === 2, `SKIPPED kayıt ${rows[0].n} (2 olmalı)`);
      return 'imzasız + yanlış imza → SKIPPED, webhook_events denetim izinde';
    }),
  () =>
    check('15-hmac-abonelik-aktivasyonu-hak', async () => {
      const u = await register('subs');
      const eps = await findEpisodes();
      // Abonelik YOKKEN premium bölüm oturumu açılamaz (sunucu doğrulaması).
      const denied = await call('POST', `/media/playback/${eps.sub}/session`, { token: u.token });
      assert(denied.status === 402 || denied.status === 403, `aboneliksiz premium ${denied.status} (402/403 beklenir)`);
      const payload = {
        source: 'REVENUECAT',
        eventId: `qa-a15-${stamp}`,
        eventType: 'SUBSCRIPTION_ACTIVATED',
        payload: {
          userId: u.userId, userEmail: u.email, productId: 'SUB_MONTHLY', platform: 'IOS',
          storeTransactionId: `qa_a15_tx_${stamp}`, storeOriginalTransactionId: `qa_a15_orig_${stamp}`,
        },
      };
      const raw = JSON.stringify(payload);
      const wh = await call('POST', '/billing/webhooks', {
        headers: { 'X-PerdeGo-Signature': hmacSig(raw) },
        body: payload,
      });
      assert(wh.status === 202 && wh.body.data?.state === 'PROCESSED', `webhook ${wh.status}/${wh.body.data?.state}`);
      const sub = await call('GET', '/billing/subscription', { token: u.token });
      assert(sub.body.data?.entitlement === true, `entitlement=${sub.body.data?.entitlement}`);
      assert(['TRIALING', 'ACTIVE'].includes(sub.body.data?.status), `status=${sub.body.data?.status}`);
      const allowed = await call('POST', `/media/playback/${eps.sub}/session`, { token: u.token });
      assert(allowed.status === 201, `abonelikle premium oturum ${allowed.status} (201 beklenir)`);
      return `aboneliksiz ${denied.status} → webhook PROCESSED → status=${sub.body.data.status}, oturum 201 (sunucu yetki doğrulaması)`;
    }),
  () =>
    check('16-webhook-tekrari-skip-cift-isleme-yok', async () => {
      const payload = {
        source: 'REVENUECAT',
        eventId: `qa-a16-${stamp}`,
        eventType: 'SUBSCRIPTION_ACTIVATED',
        payload: {
          userId: (await register('replay')).userId, userEmail: 'x@x.test', productId: 'SUB_MONTHLY',
          platform: 'IOS', storeTransactionId: `qa_a16_tx_${stamp}`,
        },
      };
      const raw = JSON.stringify(payload);
      const first = await call('POST', '/billing/webhooks', {
        headers: { 'X-PerdeGo-Signature': hmacSig(raw) }, body: payload,
      });
      assert(first.body.data?.state === 'PROCESSED', `ilk ${first.body.data?.state}`);
      const second = await call('POST', '/billing/webhooks', {
        headers: { 'X-PerdeGo-Signature': hmacSig(raw) }, body: payload,
      });
      assert(second.body.data?.duplicate === true && second.body.data?.state === 'SKIPPED', `tekrar ${JSON.stringify(second.body.data)}`);
      const txRows = await q(
        `SELECT COUNT(*)::int AS n FROM store_transactions WHERE "storeTransactionId" = $1`,
        [`qa_a16_tx_${stamp}`],
      );
      assert(txRows[0].n === 1, `store_transactions ${txRows[0].n} satır (1 olmalı)`);
      return 'aynı eventId tekrarı → duplicate=true SKIPPED, tek işlem kaydı';
    }),
  () =>
    check('17-iade-abonelik-expired', async () => {
      const u = await register('iade');
      const act = {
        source: 'REVENUECAT', eventId: `qa-a17a-${stamp}`, eventType: 'SUBSCRIPTION_ACTIVATED',
        payload: { userId: u.userId, userEmail: u.email, productId: 'SUB_YEARLY', platform: 'IOS',
          storeTransactionId: `qa_a17_tx_${stamp}`, storeOriginalTransactionId: `qa_a17_orig_${stamp}` },
      };
      const rawAct = JSON.stringify(act);
      await call('POST', '/billing/webhooks', { headers: { 'X-PerdeGo-Signature': hmacSig(rawAct) }, body: act });
      const before = await call('GET', '/billing/subscription', { token: u.token });
      assert(before.body.data?.entitlement === true, 'aktivasyon sonrası hak yok');
      const refund = {
        source: 'REVENUECAT', eventId: `qa-a17b-${stamp}`, eventType: 'PURCHASE_REFUNDED',
        payload: { platform: 'IOS', storeTransactionId: `qa_a17_tx_${stamp}` },
      };
      const rawRef = JSON.stringify(refund);
      const wh = await call('POST', '/billing/webhooks', {
        headers: { 'X-PerdeGo-Signature': hmacSig(rawRef) }, body: refund,
      });
      assert(wh.body.data?.state === 'PROCESSED', `iade ${wh.body.data?.state}`);
      const after = await call('GET', '/billing/subscription', { token: u.token });
      assert(after.body.data?.status === 'EXPIRED', `iade sonrası ${after.body.data?.status}`);
      assert(after.body.data?.entitlement === false, 'iade sonrası hak sürüyor!');
      return 'abonelik iadesi → EXPIRED + entitlement=false';
    }),
  () =>
    check('18-rc-webhook-yapilandirmamis-503', async () => {
      const res = await fetch(`${base}/api/v1/billing/webhooks/revenuecat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({ event: { type: 'TEST', id: `qa-a18-${stamp}`, original_app_user_id: 'x' } }),
      });
      const body = await res.json();
      assert(res.status === 503, `RC webhook ${res.status} (503 beklenir)`);
      assert(body.error?.details?.reason === 'BILLING_NOT_CONFIGURED', `reason=${body.error?.details?.reason}`);
      return 'sağlayıcı yokken RC webhook 503 fail-closed';
    }),
  () =>
    check('19-sync-simule-sahte-durum-yok', async () => {
      const u = await register('sync');
      const res = await call('POST', '/billing/entitlements/sync', { token: u.token, body: { platform: 'IOS' } });
      // Sözleşme durum kodu sabitlemez (Nest POST varsayılanı 201) — 200/201 ikisi de uyumlu.
      assert(res.status === 200 || res.status === 201, `sync ${res.status}`);
      assert(res.body.data?.subscription?.status === 'NONE', `sync status=${res.body.data?.subscription?.status}`);
      const w = await wallet(u.token);
      assert(w.purchasedCredits === 0, 'sync sahte kredi üretti!');
      return `simüle sağlayıcıda sync boş durum → NONE (${res.status}), sahte hak yok`;
    }),
  () =>
    check('20-kimlik-dogrulamasi-401', async () => {
      const noAuth = await call('GET', '/billing/subscription');
      assert(noAuth.status === 401, `subscription anonim ${noAuth.status}`);
      const noAuthUnlock = await call('POST', '/credits/unlock/olmayan', { body: {} });
      assert(noAuthUnlock.status === 401, `unlock anonim ${noAuthUnlock.status}`);
      const badToken = await call('GET', '/billing/subscription', { token: 'sahte.token.burda' });
      assert(badToken.status === 401, `sahte token ${badToken.status}`);
      return 'anonim/sahte token → 401 (erişim yetkisi sunucuda)';
    }),
  () =>
    check('21-purchases-gecmis-ve-sayfalama', async () => {
      const u = await register('gecmis');
      await call('POST', '/billing/purchases/validate', {
        token: u.token, headers: { 'Idempotency-Key': `qa-a21-${stamp}` },
        body: { platform: 'IOS', productType: 'CREDIT_PACK', productId: 'perdego.pack.pack_10', storeTransactionId: `qa_a21_tx_${stamp}` },
      });
      const res = await call('GET', '/billing/purchases?page=1&pageSize=10', { token: u.token });
      assert(res.status === 200, `purchases ${res.status}`);
      const items = res.body.data?.items ?? [];
      assert(items.length === 1 && items[0].storeTransactionId === `qa_a21_tx_${stamp}`, 'geçmiş kaydı');
      return `işlem geçmişi 1 kayıt, purchaseState=${items[0]?.purchaseState}`;
    }),
];

// ===========================================================================
// FAZ B — RevenueCat zarfı yaşam döngüsü (test anahtarları, Bearer sırrı)
// ===========================================================================
function rcEvent(type, id, extra) {
  return { event: { type, id, ...extra } };
}
async function rcPost(event, authHeader) {
  const res = await fetch(`${base}/api/v1/billing/webhooks/revenuecat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
    body: JSON.stringify(event),
  });
  const body = await res.json();
  return { status: res.status, body };
}
const DAY = 86_400_000;

const checksB = [
  () =>
    check('01-config-revenuecat', async () => {
      const res = await call('GET', '/billing/config');
      assert(res.status === 200 && res.body.data.provider === 'revenuecat', `provider=${res.body.data?.provider}`);
      assert(res.body.data.configured === true, 'configured=false (sır set olmalı)');
      return 'provider=revenuecat, configured=true (test anahtarları)';
    }),
  () =>
    check('02-validate-fail-closed-503', async () => {
      const u = await register('vfc');
      const res = await call('POST', '/billing/purchases/validate', {
        token: u.token, headers: { 'Idempotency-Key': `qa-b02-${stamp}` },
        body: { platform: 'IOS', productType: 'CREDIT_PACK', productId: 'perdego.pack.pack_10', storeTransactionId: `qa_b02_tx_${stamp}` },
      });
      assert(res.status === 503, `validate ${res.status} (503 beklenir — RC erişilemez)`);
      assert(res.body.error?.details?.reason === 'BILLING_PROVIDER_UNREACHABLE', `reason=${res.body.error?.details?.reason}`);
      const w = await wallet(u.token);
      assert(w.purchasedCredits === 0, 'doğrulanamayan satın almadan kredi geldi!');
      return 'RC erişilemez → 503 fail-closed, kredi verilmedi (test RC anahtarı geçersiz)';
    }),
  () =>
    check('03-rc-initial-purchase-abonelik', async () => {
      const u = await register('rcsub');
      const ev = rcEvent('INITIAL_PURCHASE', `qa-b03-${stamp}`, {
        app_user_id: u.userId, product_id: 'perdego.sub.monthly', transaction_id: `qa_b03_tx_${stamp}`,
        original_transaction_id: `qa_b03_tx_${stamp}`, expiration_at_ms: Date.now() + 30 * DAY,
        period_type: 'NORMAL', store: 'APP_STORE',
      });
      const res = await rcPost(ev, `Bearer ${rcSecret}`);
      assert(res.status === 202, `RC webhook ${res.status}`);
      assert(res.body.data?.state === 'PROCESSED', `state=${res.body.data?.state}`);
      const sub = await call('GET', '/billing/subscription', { token: u.token });
      assert(sub.body.data?.status === 'ACTIVE' || sub.body.data?.status === 'TRIALING', `status=${sub.body.data?.status}`);
      assert(sub.body.data?.entitlement === true, 'entitlement=false');
      const rows = await q(
        `SELECT "currentPeriodEnd" AS end_, "storeOriginalTransactionId" AS orig, "status" AS st FROM subscriptions WHERE "storeOriginalTransactionId" = $1`,
        [`qa_b03_tx_${stamp}`],
      );
      assert(rows.length === 1, `abonelik satır ${rows.length}`);
      return `RC zarfı INITIAL_PURCHASE → ${rows[0].st}, dönem bitişi mağazadan (${new Date(rows[0].end_).toISOString().slice(0, 10)})`;
    }),
  () =>
    check('04-rc-webhook-tekrari-skip', async () => {
      const u = await register('rctekrar');
      const ev = rcEvent('INITIAL_PURCHASE', `qa-b04-${stamp}`, {
        app_user_id: u.userId, product_id: 'perdego.pack.pack_10',
        transaction_id: `qa_b04_tx_${stamp}`, original_transaction_id: `qa_b04_tx_${stamp}`, store: 'PLAY_STORE',
      });
      const first = await rcPost(ev, `Bearer ${rcSecret}`);
      assert(first.body.data?.state === 'PROCESSED', `ilk ${first.body.data?.state}`);
      const second = await rcPost(ev, `Bearer ${rcSecret}`);
      assert(second.body.data?.duplicate === true && second.body.data?.state === 'SKIPPED', `tekrar ${JSON.stringify(second.body.data)}`);
      return 'aynı RC eventId tekrar → duplicate SKIPPED';
    }),
  () =>
    check('05-rc-yanlis-bearer-skip', async () => {
      const ev = rcEvent('TEST', `qa-b05-${stamp}`, {});
      const res = await rcPost(ev, 'Bearer yanlis-sir-degeri-123456');
      assert(res.body.data?.state === 'SKIPPED', `yanlış Bearer state=${res.body.data?.state}`);
      const rows = await q(
        `SELECT state, "errorMessage" AS err FROM webhook_events WHERE "eventId" = $1`,
        [`qa-b05-${stamp}`],
      );
      assert(rows[0]?.err === 'INVALID_SIGNATURE', `errorMessage=${rows[0]?.err}`);
      return 'yanlış Bearer → SKIPPED INVALID_SIGNATURE (timing-safe karşılaştırma)';
    }),
  () =>
    check('06-rc-iptal-ve-expiration', async () => {
      const u = await register('rciptal');
      const tx = `qa_b06_tx_${stamp}`;
      await rcPost(rcEvent('INITIAL_PURCHASE', `qa-b06a-${stamp}`, {
        app_user_id: u.userId, product_id: 'perdego.sub.yearly', transaction_id: tx,
        original_transaction_id: tx, expiration_at_ms: Date.now() + 365 * DAY, period_type: 'NORMAL', store: 'APP_STORE',
      }), `Bearer ${rcSecret}`);
      const cancel = await rcPost(rcEvent('CANCELLATION', `qa-b06b-${stamp}`, {
        app_user_id: u.userId, original_transaction_id: tx, store: 'APP_STORE',
      }), `Bearer ${rcSecret}`);
      assert(cancel.body.data?.state === 'PROCESSED', `CANCELLATION ${cancel.body.data?.state}`);
      const afterCancel = await call('GET', '/billing/subscription', { token: u.token });
      assert(afterCancel.body.data?.autoRenew === false, `autoRenew=${afterCancel.body.data?.autoRenew}`);
      assert(afterCancel.body.data?.entitlement === true, 'iptalde dönem bitene kadar hak sürmeli');
      const exp = await rcPost(rcEvent('EXPIRATION', `qa-b06c-${stamp}`, {
        app_user_id: u.userId, original_transaction_id: tx, store: 'APP_STORE',
      }), `Bearer ${rcSecret}`);
      assert(exp.body.data?.state === 'PROCESSED', `EXPIRATION ${exp.body.data?.state}`);
      const afterExp = await call('GET', '/billing/subscription', { token: u.token });
      assert(afterExp.body.data?.status === 'EXPIRED' && afterExp.body.data?.entitlement === false, `durum ${afterExp.body.data?.status}/${afterExp.body.data?.entitlement}`);
      return 'CANCELLATION → autoRenew=false (hak dönem sonuna kadar), EXPIRATION → EXPIRED';
    }),
  () =>
    check('07-rc-uncancellation-resume', async () => {
      const u = await register('rcgeri');
      const tx = `qa_b07_tx_${stamp}`;
      await rcPost(rcEvent('INITIAL_PURCHASE', `qa-b07a-${stamp}`, {
        app_user_id: u.userId, product_id: 'perdego.sub.monthly', transaction_id: tx,
        original_transaction_id: tx, expiration_at_ms: Date.now() + 30 * DAY, store: 'APP_STORE',
      }), `Bearer ${rcSecret}`);
      await rcPost(rcEvent('CANCELLATION', `qa-b07b-${stamp}`, {
        app_user_id: u.userId, original_transaction_id: tx, store: 'APP_STORE',
      }), `Bearer ${rcSecret}`);
      const res = await rcPost(rcEvent('UNCANCELLATION', `qa-b07c-${stamp}`, {
        app_user_id: u.userId, original_transaction_id: tx, store: 'APP_STORE',
      }), `Bearer ${rcSecret}`);
      assert(res.body.data?.state === 'PROCESSED', `UNCANCELLATION ${res.body.data?.state}`);
      const sub = await call('GET', '/billing/subscription', { token: u.token });
      assert(sub.body.data?.autoRenew === true, `autoRenew=${sub.body.data?.autoRenew}`);
      return 'UNCANCELLATION → otomatik yenileme geri açıldı';
    }),
  () =>
    check('08-rc-kredi-paketi-ve-iade-clawback', async () => {
      const u = await register('rckredi');
      const tx = `qa_b08_tx_${stamp}`;
      const buy = await rcPost(rcEvent('INITIAL_PURCHASE', `qa-b08a-${stamp}`, {
        app_user_id: u.userId, product_id: 'perdego.pack.pack_25', transaction_id: tx,
        original_transaction_id: tx, store: 'PLAY_STORE',
      }), `Bearer ${rcSecret}`);
      assert(buy.body.data?.state === 'PROCESSED', `paket ${buy.body.data?.state}`);
      let w = await wallet(u.token);
      assert(w.purchasedCredits === 25, `paket sonrası ${w.purchasedCredits} ≠ 25`);
      // 10 kredi harca, sonra iade → harcanmış miktar geri istenemez.
      const eps = await findEpisodes();
      const cost1 = eps.credit[0].cost;
      await call('POST', `/credits/unlock/${eps.credit[0].id}`, { token: u.token, body: {} });
      const refund = await rcPost(rcEvent('REFUND', `qa-b08b-${stamp}`, {
        app_user_id: u.userId, product_id: 'perdego.pack.pack_25', transaction_id: tx,
        original_transaction_id: tx, store: 'PLAY_STORE',
      }), `Bearer ${rcSecret}`);
      assert(refund.body.data?.state === 'PROCESSED', `REFUND ${refund.body.data?.state}`);
      w = await wallet(u.token);
      // F7-03 düzeltmesi sonrası: harcanan 2 hediye kredi geri istenmez;
      // kalan bakiye (25 satın alınan + 3 hediye) tamamen clawback edilir.
      assert(w.purchasedCredits === 0 && w.grantedCredits === 0, `iade sonrası p=${w.purchasedCredits}, g=${w.grantedCredits} (0/0 beklenir)`);
      const refundLedger = await q(
        `SELECT COUNT(*)::int AS n FROM credit_ledger WHERE "idempotencyKey" = $1 AND type = 'REFUND'`,
        [`refund:ANDROID:${tx}`],
      );
      assert(refundLedger[0].n === 1, `REFUND ledger ${refundLedger[0].n} satır`);
      const txRow = await q(`SELECT "purchaseState" AS s, "refundedAt" AS r FROM store_transactions WHERE "storeTransactionId" = $1`, [tx]);
      assert(txRow[0]?.s === 'REFUNDED' && txRow[0]?.r !== null, `işlem durumu ${txRow[0]?.s}`);
      // İade tekrarı: webhook düzeyinde SKIPPED, ek ledger YOK.
      const replay = await rcPost(rcEvent('REFUND', `qa-b08b-${stamp}`, {
        app_user_id: u.userId, product_id: 'perdego.pack.pack_25', transaction_id: tx, store: 'PLAY_STORE',
      }), `Bearer ${rcSecret}`);
      assert(replay.body.data?.duplicate === true, 'iade tekrarı duplicate değil');
      return `RC kredi paketi +25 → harcama ${cost1} → REFUND clawback → purchased=${w.purchasedCredits}, REFUND ledger tek satır, iade tekrarı SKIPPED`;
    }),
  () =>
    check('09-rc-bilinmeyen-kullanici-ve-urun-failed', async () => {
      const evUser = rcEvent('INITIAL_PURCHASE', `qa-b09a-${stamp}`, {
        app_user_id: 'olmayan-kullanici-999', product_id: 'perdego.pack.pack_10',
        transaction_id: `qa_b09a_tx_${stamp}`, store: 'APP_STORE',
      });
      const r1 = await rcPost(evUser, `Bearer ${rcSecret}`);
      assert(r1.status === 202 && r1.body.data?.state === 'FAILED', `bilinmeyen kullanıcı ${r1.status}/${r1.body.data?.state}`);
      const u = await register('bilinmeyenurun');
      const evProduct = rcEvent('INITIAL_PURCHASE', `qa-b09b-${stamp}`, {
        app_user_id: u.userId, product_id: 'perdego.bilinmeyen.urun',
        transaction_id: `qa_b09b_tx_${stamp}`, store: 'APP_STORE',
      });
      const r2 = await rcPost(evProduct, `Bearer ${rcSecret}`);
      assert(r2.status === 202 && r2.body.data?.state === 'FAILED', `bilinmeyen ürün ${r2.status}/${r2.body.data?.state}`);
      const w = await wallet(u.token);
      assert(w.purchasedCredits === 0, 'bilinmeyen üründen kredi geldi!');
      const failed = await q(
        `SELECT COUNT(*)::int AS n FROM webhook_events WHERE "eventId" IN ($1, $2) AND state = 'FAILED'`,
        [`qa-b09a-${stamp}`, `qa-b09b-${stamp}`],
      );
      assert(failed[0].n === 2, `FAILED kayıt ${failed[0].n}`);
      return 'bilinmeyen kullanıcı/ürün → FAILED (sessiz kayıp yok), kredi verilmedi';
    }),
  () =>
    check('10-rc-billing-issue-grace-ve-hold', async () => {
      const u = await register('rcodeme');
      const tx = `qa_b10_tx_${stamp}`;
      await rcPost(rcEvent('INITIAL_PURCHASE', `qa-b10a-${stamp}`, {
        app_user_id: u.userId, product_id: 'perdego.sub.monthly', transaction_id: tx,
        original_transaction_id: tx, expiration_at_ms: Date.now() + 30 * DAY, store: 'APP_STORE',
      }), `Bearer ${rcSecret}`);
      const noGrace = await rcPost(rcEvent('BILLING_ISSUE', `qa-b10b-${stamp}`, {
        app_user_id: u.userId, original_transaction_id: tx, store: 'APP_STORE',
      }), `Bearer ${rcSecret}`);
      assert(noGrace.body.data?.state === 'PROCESSED', `BILLING_ISSUE ${noGrace.body.data?.state}`);
      const onHold = await call('GET', '/billing/subscription', { token: u.token });
      assert(onHold.body.data?.status === 'ON_HOLD', `durum=${onHold.body.data?.status}`);
      assert(onHold.body.data?.entitlement === false, 'ON_HOLD iken hak sürüyor!');
      const grace = await rcPost(rcEvent('BILLING_ISSUE', `qa-b10c-${stamp}`, {
        app_user_id: u.userId, original_transaction_id: tx, store: 'APP_STORE',
        grace_period_expiration_at_ms: Date.now() + 7 * DAY,
      }), `Bearer ${rcSecret}`);
      assert(grace.body.data?.state === 'PROCESSED', `grace ${grace.body.data?.state}`);
      const inGrace = await call('GET', '/billing/subscription', { token: u.token });
      assert(inGrace.body.data?.status === 'GRACE_PERIOD', `grace durumu=${inGrace.body.data?.status}`);
      assert(inGrace.body.data?.entitlement === true, 'grace dönemide hak yok');
      return "BILLING_ISSUE: grace'siz → ON_HOLD (erişim durur), grace'li → GRACE_PERIOD (hak sürer)";
    }),
  () =>
    check('11-rc-transfer-sahiplik', async () => {
      const from = await register('transfer-from');
      const to = await register('transfer-to');
      const tx = `qa_b11_tx_${stamp}`;
      await rcPost(rcEvent('INITIAL_PURCHASE', `qa-b11a-${stamp}`, {
        app_user_id: from.userId, product_id: 'perdego.pack.pack_10', transaction_id: tx,
        original_transaction_id: tx, store: 'APP_STORE',
      }), `Bearer ${rcSecret}`);
      const res = await rcPost(rcEvent('TRANSFER', `qa-b11b-${stamp}`, {
        transferred_from: [from.userId], transferred_to: [to.userId], original_transaction_id: tx,
        product_id: 'perdego.pack.pack_10', store: 'APP_STORE',
      }), `Bearer ${rcSecret}`);
      assert(res.body.data?.state === 'PROCESSED', `TRANSFER ${res.body.data?.state}`);
      const rows = await q(`SELECT "userId" AS u FROM store_transactions WHERE "storeTransactionId" = $1`, [tx]);
      assert(rows[0]?.u === to.userId, `işlem sahibi değişmedi (${rows[0]?.u} ≠ ${to.userId})`);
      return `TRANSFER → işlem ${from.userId.slice(0, 8)}… → ${to.userId.slice(0, 8)}… taşındı (kredi bakiyesi faz kaydı: harcama cüzdanı kaynakta kalır — raporda belgeli sınırlama)`;
    }),
  () =>
    check('12-rc-test-ve-bilinmeyen-olay-tipi', async () => {
      const t = await rcPost(rcEvent('TEST', `qa-b12a-${stamp}`, {}), `Bearer ${rcSecret}`);
      assert(t.body.data?.state === 'PROCESSED', `TEST ${t.body.data?.state}`);
      const unknown = await rcPost(rcEvent('GELECEK_OLAY_2099', `qa-b12b-${stamp}`, {
        app_user_id: 'x', product_id: 'y',
      }), `Bearer ${rcSecret}`);
      assert(unknown.body.data?.state === 'PROCESSED', `bilinmeyen tip ${unknown.body.data?.state}`);
      return 'TEST no-op PROCESSED; ileri uyum: bilinmeyen olay hataya düşmez';
    }),
  () =>
    check('14-sync-saglayici-erisilemez-503', async () => {
      const u = await register('rcsync');
      const res = await call('POST', '/billing/entitlements/sync', { token: u.token, body: { platform: 'IOS' } });
      // F7-06 düzeltmesi: RC erişilemezken sync 503 fail-closed (500 değil).
      assert(res.status === 503, `sync ${res.status} (503 beklenir)`);
      assert(res.body.error?.details?.reason === 'BILLING_PROVIDER_UNREACHABLE', `reason=${res.body.error?.details?.reason}`);
      return 'RC erişilemez → sync 503 BILLING_PROVIDER_UNREACHABLE (fail-closed, sahte senkron yok)';
    }),
  () =>
    check('13-webhook-events-denetim-izi', async () => {
      const dup = await q(
        `SELECT COUNT(*)::int AS n FROM (
           SELECT source, "eventId" FROM webhook_events GROUP BY source, "eventId" HAVING COUNT(*) > 1
         ) d`,
      );
      assert(dup[0].n === 0, `mükerrer (source,eventId) ${dup[0].n} çift`);
      const states = await q(`SELECT state, COUNT(*)::int AS n FROM webhook_events GROUP BY state`);
      const summary = states.map((s) => `${s.state}=${s.n}`).join(', ');
      return `UNIQUE(source,eventId) ihlali yok; durum dağılımı: ${summary}`;
    }),
];

// ===========================================================================
// FAZ C — üretim modu kanıtları: NODE_ENV=production boot'u bu depoda
// BİLİNÇLİ olarak engellenmiştir (MEDIA_PROVIDER=local üretimde reddedilir,
// canlı sağlayıcı adapter'ı yoktur — env şeması refine'ları). Üretim
// savunmaları runner içinde qa-faz7-prod-refine-check.ts ile kanıtlanır.
// ===========================================================================
const checksC = [];

// ===========================================================================
async function main() {
  console.log(`\n===== FAZ 7 KABUL PROBE — FAZ ${phase} → ${base} =====\n`);
  const checks = phase === 'A' ? checksA : phase === 'B' ? checksB : checksC;
  for (const fn of checks) await fn();
  const pass = results.filter((r) => r.ok && !r.warn).length;
  const warn = results.filter((r) => r.ok && r.warn).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n--- FAZ ${phase} SONUÇ: ${pass} PASS, ${warn} WARN, ${fail} FAIL (toplam ${results.length}) ---`);
  if (fail > 0) {
    console.log('BAŞARISIZLAR:');
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${phase}-${r.name}: ${r.evidence}`);
  }
  await dbClient?.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error('PROBE KRİTİK HATA:', error);
  await dbClient?.end();
  process.exit(1);
});
