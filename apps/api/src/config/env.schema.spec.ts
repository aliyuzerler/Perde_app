import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.schema';

const baseEnv = {
  DATABASE_URL: 'postgresql://perdego:parola@localhost:5432/perdego',
};

/** Base64 kodlu sahte PEM üretici (test anahtarı — geçersiz içerik, yalnız biçim denetimi). */
const fakePem = (tag: string) => `-----BEGIN ${tag}-----\nZmFrZQ==\n-----END ${tag}-----`;
const fakePrivKey = Buffer.from(fakePem('RSA PRIVATE KEY')).toString('base64');
const fakePubKey = Buffer.from(fakePem('PUBLIC KEY')).toString('base64');

describe('loadEnv (ortam değişkeni doğrulaması)', () => {
  it('eksik DATABASE_URL için anlaşılır hata verir', () => {
    const result = loadEnv({});

    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.includes('DATABASE_URL'))).toBe(true);
    expect(result.errors?.some((e) => e.includes('zorunludur'))).toBe(true);
  });

  it('postgresql:// ile başlamayan DATABASE_URL için hata verir', () => {
    const result = loadEnv({ DATABASE_URL: 'mysql://yanlis' });

    expect(result.ok).toBe(false);
    expect(
      result.errors?.some((e) => e.includes('postgresql://')),
    ).toBe(true);
  });

  it('geçersiz PORT için hata verir', () => {
    const result = loadEnv({ ...baseEnv, PORT: '70000' });

    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.includes('PORT'))).toBe(true);
  });

  it('geçersiz NODE_ENV için hata verir', () => {
    const result = loadEnv({ ...baseEnv, NODE_ENV: 'staging' });

    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.includes('NODE_ENV'))).toBe(true);
  });

  it('geçerli minimal ortam varsayılanlarla ayrıştırılır', () => {
    const result = loadEnv({ ...baseEnv });

    expect(result.ok).toBe(true);
    expect(result.env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: baseEnv.DATABASE_URL,
      CORS_ORIGINS: '',
    });
  });

  it('boş REDIS_URL tanımsız sayılır (opsiyonel)', () => {
    const result = loadEnv({ ...baseEnv, REDIS_URL: '' });

    expect(result.ok).toBe(true);
  });

  it('redis:// dışı REDIS_URL için hata verir', () => {
    const result = loadEnv({ ...baseEnv, REDIS_URL: 'http://yanlis:6379' });

    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.includes('REDIS_URL'))).toBe(true);
  });

  it('PRODUCTION: JWT + canlı sağlayıcı + WEBHOOK_SIGNING_SECRET ile doğrulanır', () => {
    const result = loadEnv({
      ...baseEnv,
      NODE_ENV: 'production',
      MEDIA_PROVIDER: 'bunny',
      JWT_ACCESS_PRIVATE_KEY: fakePrivKey,
      JWT_ACCESS_PUBLIC_KEY: fakePubKey,
      WEBHOOK_SIGNING_SECRET: 'cok-gizli-uretim-sigorta-anahtari-1234',
    });

    expect(result.ok).toBe(true);
  });

  it('PRODUCTION: WEBHOOK_SIGNING_SECRET yoksa hata verir (F6-01 — DATABASE_URL türetimli fallback üretimde yasak)', () => {
    const result = loadEnv({
      ...baseEnv,
      NODE_ENV: 'production',
      MEDIA_PROVIDER: 'bunny',
      JWT_ACCESS_PRIVATE_KEY: fakePrivKey,
      JWT_ACCESS_PUBLIC_KEY: fakePubKey,
    });

    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.includes('WEBHOOK_SIGNING_SECRET'))).toBe(true);
  });

  it('DEVELOPMENT: WEBHOOK_SIGNING_SECRET tanımsız olabilir (fallback serbest)', () => {
    const result = loadEnv({ ...baseEnv, NODE_ENV: 'development' });

    expect(result.ok).toBe(true);
    expect(result.env?.WEBHOOK_SIGNING_SECRET).toBeUndefined();
  });
});
