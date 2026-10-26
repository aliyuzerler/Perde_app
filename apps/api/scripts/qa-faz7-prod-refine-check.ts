/**
 * FAZ 7 — Üretim (NODE_ENV=production) savunma kanıtları (QA).
 *
 * NODE_ENV=production tam boot'u bu depoda bilinçli olarak engellenmiştir:
 *   - env şeması MEDIA_PROVIDER=local'i üretimde reddeder (FAZ 4 kuralı),
 *   - bunny/mux/cf sağlayıcı fabrikası uygulanmadığı için boot'ta hata verir.
 * Bu nedenle üretim savunmaları ŞEMA + FABRİKA + SAĞLAYICI düzeyinde,
 * gerçek production env kombinasyonlarıyla burada kanıtlanır:
 *   1) üretimde JWT anahtarları zorunlu
 *   2) üretimde MEDIA_PROVIDER=local reddedilir
 *   3) üretimde WEBHOOK_SIGNING_SECRET zorunlu (F6-01)
 *   4) yarım RC yapılandırması reddedilir (webhook sırrı eksik vb.)
 *   5) üretim + RC → REVENUECAT_PUBLIC_SDK_KEY zorunlu
 *   6) geçerli üretim yapılandırması kabul edilir
 *   7) SimulatedBillingProvider üretimde: configured=false, verifyPurchase throw,
 *      fetchSubscriberState throw (sahte başarı üretilemez — Güvenlik-9)
 */
import { generateKeyPairSync } from 'node:crypto';
import { loadEnv } from '../src/config/env.schema';
import { SimulatedBillingProvider } from '../src/billing/provider/simulated.provider';
import type { Env } from '../src/config/env.schema';

// Gerçek RSA anahtar çifti (env şeması "Base64 kodlu PEM" bekler).
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWT_PRIV = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()).toString('base64');
const JWT_PUB = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' }).toString()).toString('base64');
const SECRET16 = '0123456789abcdef';

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, evidence: string) {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '[PASS]' : '[FAIL]'} C-${name} — ${evidence}`);
}

function expectRejected(name: string, env: Record<string, string>, mustContain: string) {
  const res = loadEnv(env as unknown as NodeJS.ProcessEnv);
  const joined = (res.errors ?? []).join(' | ');
  record(name, !res.ok && joined.includes(mustContain), res.ok ? 'reddedilmedi (HATA!)' : `reddedildi: ${joined.slice(0, 160)}`);
}

const baseProd = {
  NODE_ENV: 'production',
  PORT: '3200',
  DATABASE_URL: 'postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego?schema=public',
  MEDIA_PROVIDER: 'bunny',
  WEBHOOK_SIGNING_SECRET: 'prod-webhook-sirri-0123456789abcdef',
};

// 1) JWT anahtarları zorunlu
expectRejected('01-prod-jwt-zorunlu', { ...baseProd }, 'JWT anahtarları zorunludur');

// 2) MEDIA_PROVIDER=local üretimde reddedilir
expectRejected(
  '02-prod-local-media-reddedilir',
  { ...baseProd, JWT_ACCESS_PRIVATE_KEY: JWT_PRIV, JWT_ACCESS_PUBLIC_KEY: JWT_PUB, MEDIA_PROVIDER: 'local' },
  'MEDIA_PROVIDER=local seçilemez',
);

// 3) WEBHOOK_SIGNING_SECRET zorunlu
expectRejected(
  '03-prod-webhook-sirri-zorunlu',
  {
    ...baseProd,
    JWT_ACCESS_PRIVATE_KEY: JWT_PRIV,
    JWT_ACCESS_PUBLIC_KEY: JWT_PUB,
    WEBHOOK_SIGNING_SECRET: '',
  },
  'WEBHOOK_SIGNING_SECRET zorunludur',
);

// 4) yarım RC yapılandırması (webhook sırrı eksik)
expectRejected(
  '04-prod-rc-yarim-yapilandirma',
  {
    ...baseProd,
    JWT_ACCESS_PRIVATE_KEY: JWT_PRIV,
    JWT_ACCESS_PUBLIC_KEY: JWT_PUB,
    BILLING_PROVIDER: 'revenuecat',
    REVENUECAT_SECRET_API_KEY: SECRET16.repeat(2),
  },
  'birlikte zorunludur',
);

// 5) üretim + RC → public SDK anahtarı zorunlu
expectRejected(
  '05-prod-rc-public-sdk-zorunlu',
  {
    ...baseProd,
    JWT_ACCESS_PRIVATE_KEY: JWT_PRIV,
    JWT_ACCESS_PUBLIC_KEY: JWT_PUB,
    BILLING_PROVIDER: 'revenuecat',
    REVENUECAT_SECRET_API_KEY: SECRET16.repeat(2),
    REVENUECAT_WEBHOOK_AUTH_SECRET: SECRET16.repeat(2),
  },
  'REVENUECAT_PUBLIC_SDK_KEY zorunludur',
);

// 6) geçerli üretim yapılandırması kabul edilir
{
  const res = loadEnv({
    ...baseProd,
    JWT_ACCESS_PRIVATE_KEY: JWT_PRIV,
    JWT_ACCESS_PUBLIC_KEY: JWT_PUB,
    BILLING_PROVIDER: 'revenuecat',
    REVENUECAT_SECRET_API_KEY: SECRET16.repeat(2),
    REVENUECAT_WEBHOOK_AUTH_SECRET: SECRET16.repeat(2),
    REVENUECAT_PUBLIC_SDK_KEY: 'goog_abcdefghijklmnop',
  } as unknown as NodeJS.ProcessEnv);
  record(
    '06-prod-gecerli-yapilandirma',
    res.ok === true && res.env?.BILLING_PROVIDER === 'revenuecat',
    res.ok ? 'üretim + tam RC yapılandırması kabul edildi' : `reddedildi: ${(res.errors ?? []).join(' | ').slice(0, 160)}`,
  );
}

// 7) SimulatedBillingProvider üretimde sahte başarı üretemez
async function simulatedProdChecks(): Promise<boolean> {
  const prodEnv = {
    NODE_ENV: 'production',
    BILLING_PROVIDER: 'none',
    REVENUECAT_API_BASE_URL: 'https://api.revenuecat.com',
    PLAYBACK_TTL_SECONDS: 600,
    MEDIA_PROVIDER: 'bunny',
  } as unknown as Env;
  const provider = new SimulatedBillingProvider(prodEnv);
  const notConfigured = provider.configured === false;
  let verifyThrew = false;
  try {
    await provider.verifyPurchase({
      appUserId: 'u1',
      platform: 'IOS',
      productType: 'CREDIT_PACK',
      productId: 'perdego.pack.pack_10',
      transactionId: 'tx1',
    });
  } catch {
    verifyThrew = true;
  }
  let syncThrew = false;
  try {
    await provider.fetchSubscriberState('u1');
  } catch {
    syncThrew = true;
  }
  record(
    '07-simule-saglayici-uretimde-kapali',
    notConfigured && verifyThrew && syncThrew,
    `configured=false (${notConfigured}), verifyPurchase throw=${verifyThrew}, fetchSubscriberState throw=${syncThrew} (sahte başarı üretilemez)`,
  );
  return notConfigured && verifyThrew && syncThrew;
}

async function main() {
  await simulatedProdChecks();
  console.log(`\n--- FAZ C SONUÇ: ${pass} PASS, ${fail} FAIL ---`);
  process.exit(fail > 0 ? 1 : 0);
}

void main();
