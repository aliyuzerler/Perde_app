/**
 * Ortam değişkeni sözleşmesi (Zod).
 *
 * Kural: Uygulama, doğrulanmamış ortamla asla başlamaz. Eksik/geçersiz
 * değişken varsa main.ts, anlaşılır bir hata listesiyle çıkış yapar
 * (kabul kriteri: "Ortam değişkenleri eksikken anlaşılır hata mesajları").
 */
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce
    .number()
    .int()
    .min(1, 'PORT 1–65535 arasında olmalıdır')
    .max(65535, 'PORT 1–65535 arasında olmalıdır')
    .default(3000),
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
});

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
