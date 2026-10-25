/**
 * Zod doğrulama pipe'ı: istek gövdesi/sorgu/parametre sözleşme şemasıyla
 * ayrıştırılır; hata ZodError olarak fırlatılır (filter 400 VALIDATION_FAILED
 * + fields[] olarak zarflar). Sözleşme şemaları (packages/contracts) tek
 * doğrulama kaynağıdır — DTO sınıfı yazılmaz, çifte tanım olmaz.
 */
import { Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // ZodError DOĞRUDAN fırlatılır: global filtre 400 VALIDATION_FAILED +
      // fields[] olarak zarflar (HttpException'a sarılırsa reason bilgisi
      // kaybolur — bkz. error-filter.ts Zod dalı).
      throw result.error;
    }
    return result.data;
  }
}

/** Zod query ayrıştırma: NestJS query nesnesini şemayla doğrular.
 * Hata gövde pipe'ı ile aynı sözleşmede: ZodError → 400 VALIDATION_FAILED. */
export function parseQuery<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
