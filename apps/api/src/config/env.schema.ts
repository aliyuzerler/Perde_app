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

    // --- Faz 4: medya sağlayıcı (video akışı) -------------------------------------
    /** Video yayın sağlayıcısı: yalnızca LOCAL geliştirme adapter'ı uygulanmıştır;
     * bunny|mux|cloudflare için docs/MEDIA_SETUP.md kurulum belgesine bakın.
     * PRODUCTION'da LOCAL seçilemez (örn. veri yerel diskte kalır). */
    MEDIA_PROVIDER: z.enum(['local', 'bunny', 'mux', 'cloudflare']).default('local'),
    /** Sağlayıcıya doğrudan yükleme URL'inin geçerlilik süresi (saniye). */
    MEDIA_UPLOAD_TTL_SECONDS: intFromEnv('MEDIA_UPLOAD_TTL_SECONDS', 60, 3600, 900),
    /** Geliştirme sağlayıcısının dosya deposu (örnek paketler + yüklemeler). */
    MEDIA_STORAGE_DIR: z.string().default('media-storage'),
    /** Tek yükleme dosyası için üst sınır (MB). */
    MEDIA_MAX_UPLOAD_MB: intFromEnv('MEDIA_MAX_UPLOAD_MB', 1, 8192, 512),
    /** Geliştirme: PROCESSING → READY geçişi için sahte gecikme (ms). Testlerde 0. */
    MEDIA_PROCESSING_DELAY_MS: intFromEnv('MEDIA_PROCESSING_DELAY_MS', 0, 600000, 1500),

    // --- Faz 2b: idempotensi ve webhook ------------------------------------------
    IDEMPOTENCY_TTL_HOURS: intFromEnv('IDEMPOTENCY_TTL_HOURS', 1, 72, 24),
    /** Tanımlıysa webhook gövdesi X-PerdeGo-Signature: HMAC-SHA256(secret, body)
     * ile doğrulanır; tanımsızsa yalnızca development/test'te kabul edilir. */
    WEBHOOK_SIGNING_SECRET: z.string().min(16).max(256).optional(),

    // --- Faz 7: gerçek ödeme sağlayıcı (RevenueCat) ------------------------------
    /** none → ödeme devrede değil; uçlar anlaşılır 503 BILLING_NOT_CONFIGURED
     * döner (sahte başarılı yanıt YOK). revenuecat → mağaza doğrulamaları RC
     * REST API'siyle ters sorgulanır, webhook'lar Bearer sır ile kabul edilir. */
    BILLING_PROVIDER: z.enum(['none', 'revenuecat']).default('none'),
    /** RC gizli API anahtarı (secret) — yalnızca sunucuda; asla istemciye verilmez. */
    REVENUECAT_SECRET_API_KEY: z.string().min(16).max(256).optional(),
    /** RC webhook Authorization: Bearer sırrı — RC panelden ayarlanır. */
    REVENUECAT_WEBHOOK_AUTH_SECRET: z.string().min(16).max(256).optional(),
    /** RC SDK'nın istemciye verilir herkese açık anahtarı (Apple/Google API key). */
    REVENUECAT_PUBLIC_SDK_KEY: z.string().min(8).max(256).optional(),
    /** RC REST API kökü (testler için geçersiz kılınabilir). */
    REVENUECAT_API_BASE_URL: z.string().url().default('https://api.revenuecat.com'),

    // --- Faz 3b: e-posta (Mailpit vb.) --------------------------------------------
    /** Tanımlıysa SMTP (örn. Mailpit: localhost:1025); tanımsızsa geliştirme
     * transport'u e-postaları dosyaya + konsola yazar (MAIL_OUTBOX_FILE). */
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: intFromEnv('SMTP_PORT', 1, 65535, 1025),
    SMTP_FROM: z.string().default('PerdeGo <no-reply@perdego.local>'),
    /** Geliştirme transport'unda e-postaların JSONL olarak yazıldığı dosya. */
    MAIL_OUTBOX_FILE: z.string().default('.mail-outbox.jsonl'),

    // --- Faz 3b: tek kullanımlık anahtarlar ve silme nefalleti -------------------
    VERIFY_EMAIL_TTL_MINUTES: intFromEnv('VERIFY_EMAIL_TTL_MINUTES', 5, 10080, 1440),
    RESET_TOKEN_TTL_MINUTES: intFromEnv('RESET_TOKEN_TTL_MINUTES', 5, 1440, 30),
    DELETION_GRACE_DAYS: intFromEnv('DELETION_GRACE_DAYS', 1, 90, 30),

    // --- Faz 3b: auth rate limit (tek örnek bellek içi; yatay ölçekleme
    // için Redis tabanlı sayaç Faz sonrası) ---------------------------------------
    AUTH_RATE_LIMIT_WINDOW_SECONDS: intFromEnv('AUTH_RATE_LIMIT_WINDOW_SECONDS', 10, 3600, 60),
    AUTH_RATE_LIMIT_LOGIN_MAX: intFromEnv('AUTH_RATE_LIMIT_LOGIN_MAX', 1, 100, 5),
    AUTH_RATE_LIMIT_REGISTER_MAX: intFromEnv('AUTH_RATE_LIMIT_REGISTER_MAX', 1, 100, 3),
    AUTH_RATE_LIMIT_RESET_MAX: intFromEnv('AUTH_RATE_LIMIT_RESET_MAX', 1, 100, 3),

    // --- Faz 3b: avatar yükleme ---------------------------------------------------
    /** Avatar dosyalarının kaydedildiği dizin (göreli: çalışma dizinine göre). */
    UPLOAD_DIR: z.string().default('uploads'),
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
      env.NODE_ENV !== 'production' || Boolean(env.JWT_ACCESS_PRIVATE_KEY && env.JWT_ACCESS_PUBLIC_KEY),
    {
      message:
        'PRODUCTION ortamında JWT anahtarları zorunludur (geliştirmede geçici üretilir)',
      path: ['JWT_ACCESS_PRIVATE_KEY'],
    },
  )
  .refine(
    (env) => env.NODE_ENV !== 'production' || env.MEDIA_PROVIDER !== 'local',
    {
      message:
        'PRODUCTION ortamında MEDIA_PROVIDER=local seçilemez (docs/MEDIA_SETUP.md — canlı sağlayıcı kurulumuna bakın)',
      path: ['MEDIA_PROVIDER'],
    },
  )
  .refine(
    (env) => env.NODE_ENV !== 'production' || Boolean(env.WEBHOOK_SIGNING_SECRET),
    {
      message:
        'PRODUCTION ortamında WEBHOOK_SIGNING_SECRET zorunludur — oynatma/yükleme imza sırrı; DATABASE_URL türetimli fallback yalnız geliştirme içindir (FAZ 6 bulgusu F6-01)',
      path: ['WEBHOOK_SIGNING_SECRET'],
    },
  )
  .refine(
    (env) =>
      // RC yapılandırması yarım bırakılamaz: secret + webhook sırrı birlikte.
      env.BILLING_PROVIDER !== 'revenuecat' ||
      Boolean(env.REVENUECAT_SECRET_API_KEY && env.REVENUECAT_WEBHOOK_AUTH_SECRET),
    {
      message:
        'BILLING_PROVIDER=revenuecat için REVENUECAT_SECRET_API_KEY ve REVENUECAT_WEBHOOK_AUTH_SECRET birlikte zorunludur (docs/BILLING_SETUP.md)',
      path: ['BILLING_PROVIDER'],
    },
  )
  .refine(
    (env) =>
      // Üretimde RC aktifse public SDK anahtarı da yapılandırılmış olmalı;
      // aksi halde mobil istemci SDK'yı kuramaz (Güvenlik-9: yarım yapılandırma yok).
      !(env.NODE_ENV === 'production' && env.BILLING_PROVIDER === 'revenuecat') ||
      Boolean(env.REVENUECAT_PUBLIC_SDK_KEY),
    {
      message:
        'PRODUCTION + BILLING_PROVIDER=revenuecat için REVENUECAT_PUBLIC_SDK_KEY zorunludur (mobil SDK herkese açık anahtar)',
      path: ['REVENUECAT_PUBLIC_SDK_KEY'],
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
    MEDIA_PROVIDER: source.MEDIA_PROVIDER,
    MEDIA_UPLOAD_TTL_SECONDS: source.MEDIA_UPLOAD_TTL_SECONDS,
    MEDIA_STORAGE_DIR: source.MEDIA_STORAGE_DIR,
    MEDIA_MAX_UPLOAD_MB: source.MEDIA_MAX_UPLOAD_MB,
    MEDIA_PROCESSING_DELAY_MS: source.MEDIA_PROCESSING_DELAY_MS,
    IDEMPOTENCY_TTL_HOURS: source.IDEMPOTENCY_TTL_HOURS,
    WEBHOOK_SIGNING_SECRET: source.WEBHOOK_SIGNING_SECRET || undefined,
    BILLING_PROVIDER: source.BILLING_PROVIDER,
    REVENUECAT_SECRET_API_KEY: source.REVENUECAT_SECRET_API_KEY || undefined,
    REVENUECAT_WEBHOOK_AUTH_SECRET: source.REVENUECAT_WEBHOOK_AUTH_SECRET || undefined,
    REVENUECAT_PUBLIC_SDK_KEY: source.REVENUECAT_PUBLIC_SDK_KEY || undefined,
    REVENUECAT_API_BASE_URL: source.REVENUECAT_API_BASE_URL,
    SMTP_HOST: source.SMTP_HOST || undefined,
    SMTP_PORT: source.SMTP_PORT,
    SMTP_FROM: source.SMTP_FROM,
    MAIL_OUTBOX_FILE: source.MAIL_OUTBOX_FILE,
    VERIFY_EMAIL_TTL_MINUTES: source.VERIFY_EMAIL_TTL_MINUTES,
    RESET_TOKEN_TTL_MINUTES: source.RESET_TOKEN_TTL_MINUTES,
    DELETION_GRACE_DAYS: source.DELETION_GRACE_DAYS,
    AUTH_RATE_LIMIT_WINDOW_SECONDS: source.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    AUTH_RATE_LIMIT_LOGIN_MAX: source.AUTH_RATE_LIMIT_LOGIN_MAX,
    AUTH_RATE_LIMIT_REGISTER_MAX: source.AUTH_RATE_LIMIT_REGISTER_MAX,
    AUTH_RATE_LIMIT_RESET_MAX: source.AUTH_RATE_LIMIT_RESET_MAX,
    UPLOAD_DIR: source.UPLOAD_DIR,
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
