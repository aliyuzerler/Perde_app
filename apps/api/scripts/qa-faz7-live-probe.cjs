/**
 * FAZ 7 canlı probe — çalışan API'ye gerçek HTTP istekleri (duman testi).
 * Sunucu ayrı başlatılır:
 *   pnpm build
 *   NODE_ENV=test DATABASE_URL=... WEBHOOK_SIGNING_SECRET=... PORT=3199 node dist/main.js &
 *   pnpm exec node scripts/qa-faz7-live-probe.mjs
 */
const { createHmac } = require('node:crypto');

const base = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3199';
const secret = process.env.WEBHOOK_SIGNING_SECRET ?? 'faz7-probe-imza-sirri-0123456789';

const log = (name, status, body) => {
  console.log(`\n=== ${name} → ${status} ===`);
  console.log(JSON.stringify(body, null, 2).slice(0, 900));
};

async function main() {
  // 1) config
  const cfg = await fetch(`${base}/api/v1/billing/config`);
  log('GET /billing/config', cfg.status, await cfg.json());

  // 2) products
  const products = await fetch(`${base}/api/v1/billing/products`);
  const productBody = await products.json();
  log('GET /billing/products', products.status, {
    plans: productBody.data?.plans?.map((p) => `${p.id}@${p.priceKurus}`),
    packs: productBody.data?.packs?.map((p) => `${p.id}@${p.priceKurus}`),
  });

  // 3) register + validate (simulated provider — yalnız test ortamı)
  const reg = await fetch(`${base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Probe Viewer',
      email: `probe-${Date.now()}@perdego.test`,
      password: 'Qa123456',
    }),
  });
  const regBody = await reg.json();
  const token = regBody.data?.tokens?.accessToken ?? '';
  console.log(`\n=== POST /auth/register → ${reg.status} (user: ${regBody.data?.user?.id ?? '?'}) ===`);

  const validate = await fetch(`${base}/api/v1/billing/purchases/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': `probe-${Date.now()}`,
    },
    body: JSON.stringify({
      platform: 'IOS',
      productType: 'CREDIT_PACK',
      productId: 'perdego.pack.pack_10',
      storeTransactionId: `probe_tx_${Date.now()}`,
    }),
  });
  log('POST /billing/purchases/validate (CREDIT_PACK)', validate.status, await validate.json());

  // 4) wallet
  const wallet = await fetch(`${base}/api/v1/credits/wallet`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  log('GET /credits/wallet', wallet.status, await wallet.json());

  // 5) RC webhook → 503 (fail-closed, sağlayıcı yapılandırılmamış)
  const rc = await fetch(`${base}/api/v1/billing/webhooks/revenuecat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: JSON.stringify({ event: { type: 'TEST', id: `probe-${Date.now()}`, original_app_user_id: 'x' } }),
  });
  log('POST /billing/webhooks/revenuecat (yapılandırılmamış)', rc.status, await rc.json());

  // 6) genel webhook (HMAC imzalı) → abonelik aktivasyonu
  const payload = {
    source: 'REVENUECAT',
    eventId: `probe-sub-${Date.now()}`,
    eventType: 'SUBSCRIPTION_ACTIVATED',
    payload: {
      userId: regBody.data?.user?.id,
      userEmail: 'x@x.test',
      productId: 'SUB_MONTHLY',
      platform: 'IOS',
      storeTransactionId: `probe_sub_${Date.now()}`,
    },
  };
  const raw = JSON.stringify(payload);
  const sig = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  const wh = await fetch(`${base}/api/v1/billing/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PerdeGo-Signature': sig },
    body: raw,
  });
  log('POST /billing/webhooks (SUBSCRIPTION_ACTIVATED)', wh.status, await wh.json());

  const sub = await fetch(`${base}/api/v1/billing/subscription`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  log('GET /billing/subscription', sub.status, await sub.json());

  console.log('\nPROBE TAMAM');
}

main().catch((error) => {
  console.error('PROBE HATA:', error);
  process.exitCode = 1;
});
