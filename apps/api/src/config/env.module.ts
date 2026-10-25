/**
 * Doğrulanmış ortamı tüm uygulamaya sağlayan global modül.
 *
 * loadEnv() main.ts'te bir kez çağrılır; başarısızsa süreç anlaşılır hata
 * ile çıkar. Başarılıysa dondurulmuş (Object.freeze) Env nesnesi sağlanır.
 */
import { Global, Module } from '@nestjs/common';
import { loadEnv } from './env.schema';
import type { Env } from './env.schema';

export const ENV = Symbol('ENV');

/** Ortam değişkenlerine erişim: constructor(@inject(ENV) private readonly env: Env) */
@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: (): Env => {
        // main.ts başarısız ortamda zaten çıkmıştır; burada yeniden
        // ayrıştırma test kolaylığı ve doğrudan çalıştırmalar içindir.
        const result = loadEnv(process.env);
        if (!result.ok || !result.env) {
          throw new Error(
            `Ortam değişkenleri doğrulanamadı:\n${(result.errors ?? []).join('\n')}`,
          );
        }
        return Object.freeze(result.env);
      },
    },
  ],
  exports: [ENV],
})
export class EnvModule {}
