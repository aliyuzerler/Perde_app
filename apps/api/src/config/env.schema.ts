/**
 * Ortam değişkeni sözleşmesi (Zod).
 *
 * Kural: Uygulama, doğrulanmamış ortamla asla başlamaz. Eksik/geçersiz
 * değişken varsa main.ts, anlaşılır bir hata listesiyle çıkış yapar.
 *
 * Faz 2b ekleri: JWT anahtarları (opsiyonel — dev'de otomatik üretilir),
 * oynatma TTL/limit, idempotensi TTL, webhook imza sırrı, public temel URL.
 */
import { z } from 'zod';

const intFromEnv = (name: string, min: number, max: number, fallback: number) =>
  z.coerce
    .number()
    .int(`${name} tam sayı olmalıdır`)
    .min(min, `${name} en az ${min} olmalıdır`)
    .max(max, `${name} en fazla ${max} olmalıdır`)
    .default(fallback);

/** Base64 kodlu PEM (satır sonları \n yerine gerçek newline gerektirmez). */
const optionalBase64Pem = z
  .string()
  .refine(
    (v) => {
      try {
        const pem = Buffer.from(v, 'base64').toString('utf8');
        return pem.includes('-----BEGIN') && pem.includes('-----END');
      } catch {
        return false;
      }
    },
    { message: 'Base64 kodlu PEM biçimli anahtar bekleniyor' },
  )
  .optional();

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: intFromEnv('PORT', 1, 65535, 3000),
    DATABASE_URL: z
      .string({
        error: (issue) =>
          issue.input === undefined
            ? 'DATABASE_URL zorunludur (örn. postgresql://perdego:PAROLA@localhost:5432/perdego)'
            : 'DATABASE_URL metin olmalıdır',
      })
      .min(1, 'DATABASE_URL boş olamaz')
      .startsWith(
        'postgresql://',
        'DATABASE_URL "postgresql://" ile başlamalıdır',
      ),
    /** Opsiyonel: boş/tanımsız ise önbellek-kuyruk entegrasyonu kapalıdır. */
    REDIS_URL: z
      .union([z.string().startsWith('redis://'), z.literal('')])
      .optional(),
    /** Virgülle ayrılmış CORS kökleri; boşsa CORS kapatılır. */
    CORS_ORIGINS: z.string().default(''),

    // --- Faz 2b: kimlik ve imza -------------------------------------------------
    /** RS256 access token anahtarları (base64 PEM). Dev'de yoksa geçici üreti
     * lir (uyarı loglanır); PRODUCTION'da zorunludur. */
    JWT_ACCESS_PRIVATE_KEY: optionalBase64Pem,
    JWT_ACCESS_PUBLIC_KEY: optionalBase64Pem,
    ACCESS_TOKEN_TTL_SECONDS: intFromEnv(
      'ACCESS_TOKEN_TTL_SECONDS',
      60,
      3600,
      900,
    ),
    REFRESH_TOKEN_TTL_DAYS: intFromEnv('REFRESH_TOKEN_TTL_DAYS', 1, 90, 30),

    // --- Faz 2b: sunum ve oynatma ------------------------------------------------
    /** Mutlak görsel URL üretiminde kullanılır (placeholder'lar). */
    PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
    PLAYBACK_TTL_SECONDS: intFromEnv('PLAYBACK_TTL_SECONDS', 60, 900, 300),
    PLAYBACK_MAX_PARALLEL: intFromEnv('PLAYBACK_MAX_PARALLEL', 1, 8, 2),

    // --- Faz 2b: idempotensi ve webhook ------------------------------------------
    IDEMPOTENCY_TTL_HOURS: intFromEnv('IDEMPOTENCY_TTL_HOURS', 1, 72, 24),
    /** Tanımlıysa webhook gövdesi X-PerdeGo-Signature: HMAC-SHA256(secret, body)
     * ile doğrulanır; tanımsızsa yalnızca development/test'te kabul edilir. */
    WEBHOOK_SIGNING_SECRET: z.string().min(16).max(256).optional(),
  })
  .refine(
    (env) =>
      // İkisi birden ya da hiçbiri: tek anahtar yarım yapılandırmadır.
      Boolean(env.JWT_ACCESS_PRIVATE_KEY) ===
      Boolean(env.JWT_ACCESS_PUBLIC_KEY),
    {
      message:
        'JWT_ACCESS_PRIVATE_KEY ve JWT_ACCESS_PUBLIC_KEY birlikte verilmelidir',
      path: ['JWT_ACCESS_PRIVATE_KEY'],
    },
  )
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' ||
      Boolean(env.JWT_ACCESS_PRIVATE_KEY && env.JWT_ACCESS_PUBLIC_KEY),
    {
      message:
        'PRODUCTION ortamında JWT anahtarları zorunludur (geliştirmede geçici üretilir)',
      path: ['JWT_ACCESS_PRIVATE_KEY'],
    },
  );

export type Env = z.infer<typeof envSchema>;

export interface EnvLoadResult {
  ok: boolean;
  env?: Env;
  /** Her satırı tek bir sorun + çözüm önerisi olan insan-okur mesajlar. */
  errors?: string[];
}

/** source (process.env) → doğrulanmış Env veya anlaşılır hata listesi. */
export function loadEnv(source: NodeJS.ProcessEnv): EnvLoadResult {
  const parsed = envSchema.safeParse({
    NODE_ENV: source.NODE_ENV,
    PORT: source.PORT,
    DATABASE_URL: source.DATABASE_URL,
    REDIS_URL: source.REDIS_URL === '' ? undefined : source.REDIS_URL,
    CORS_ORIGINS: source.CORS_ORIGINS ?? '',
    JWT_ACCESS_PRIVATE_KEY: source.JWT_ACCESS_PRIVATE_KEY || undefined,
    JWT_ACCESS_PUBLIC_KEY: source.JWT_ACCESS_PUBLIC_KEY || undefined,
    ACCESS_TOKEN_TTL_SECONDS: source.ACCESS_TOKEN_TTL_SECONDS,
    REFRESH_TOKEN_TTL_DAYS: source.REFRESH_TOKEN_TTL_DAYS,
    PUBLIC_BASE_URL: source.PUBLIC_BASE_URL,
    PLAYBACK_TTL_SECONDS: source.PLAYBACK_TTL_SECONDS,
    PLAYBACK_MAX_PARALLEL: source.PLAYBACK_MAX_PARALLEL,
    IDEMPOTENCY_TTL_HOURS: source.IDEMPOTENCY_TTL_HOURS,
    WEBHOOK_SIGNING_SECRET: source.WEBHOOK_SIGNING_SECRET || undefined,
  });

  if (parsed.success) {
    return { ok: true, env: parsed.data };
  }

  const errors = parsed.error.issues.map((issue) => {
    const path = issue.path.join('.') || '(bilinmeyen alan)';
    return `- ${path}: ${issue.message}`;
  });

  return { ok: false, errors };
}
