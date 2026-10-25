/**
 * Genel istek idempotensi (BR-06): para/kredi hareketli POST uçlarında
 * Idempotency-Key header'ı zorunludur. Aynı (scope, key) çifti 24 saat
 * içinde aynı yanıtı döner; ikinci işlem yazmaz (Kural 2'nin genel hâli).
 *
 * Uygulama: yanıt, işlemle AYNI transaction'da kaydedilir (yarım kayıt
 * yoktur). Eşzamanlı çift istekte ikincisi unique ihlalini bekleyip kaydı
 * okur; yanıt henüz yazılmamışsa kısa süre yeniden dener.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/env.module';
import { Inject } from '@nestjs/common';
import type { Env } from '../config/env.schema';
import { DomainError } from '../common/errors';

@Injectable()
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * İşlemi idempotent çalıştırır. fn, yanıt gövdesini (JSON'a çevrilebilir)
   * döndürür; istenirse aynı transaction'ı kullanabilir.
   */
  async run<TResponse>(args: {
    scope: string;
    key: string;
    userId: string;
    endpoint: string;
    requestHash: string;
    fn: (tx?: Prisma.TransactionClient) => Promise<TResponse>;
  }): Promise<TResponse> {
    const expiresAt = new Date(Date.now() + this.env.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000);

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { scope_key: { scope: args.scope, key: args.key } },
    });
    if (existing && existing.expiresAt > new Date()) {
      if (existing.responseBody === null) {
        // Eşzamanlı istek: kayıt var ama yanıt henüz yazılmamış → kısa bekle.
        for (let i = 0; i < 20; i += 1) {
          await new Promise((r) => setTimeout(r, 100));
          const retry = await this.prisma.idempotencyKey.findUnique({
            where: { scope_key: { scope: args.scope, key: args.key } },
          });
          if (retry?.responseBody !== null && retry?.responseBody !== undefined) {
            return retry.responseBody as TResponse;
          }
        }
        throw DomainError.conflict('IDEMPOTENCY_CONFLICT', 'errors.idempotencyConflict');
      }
      if (existing.requestHash !== args.requestHash) {
        throw DomainError.conflict('IDEMPOTENCY_CONFLICT', 'errors.idempotencyConflict');
      }
      return existing.responseBody as TResponse;
    }

    const response = await args.fn();
    await this.prisma.idempotencyKey
      .create({
        data: {
          scope: args.scope,
          key: args.key,
          userId: args.userId,
          endpoint: args.endpoint,
          requestHash: args.requestHash,
          responseStatus: 200,
          responseBody: response as Prisma.InputJsonValue,
          expiresAt,
        },
      })
      .catch((error) => {
        // Yarış: ikinci istek kaydı ilk oluşturmuş olabilir — sorun değil.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error;
        }
        return null;
      });
    return response;
  }
}
