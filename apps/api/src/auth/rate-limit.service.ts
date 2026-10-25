/**
 * Kimlik uçları için kayan pencere (sliding window) hız sınırlayıcı (Teknik
 * Kural 5). Bellek içi, tek örnekli — yatay ölçeklemede Redis tabanlı sayaç
 * gerekir (bilinçli sınır; SECURITY.md ve raporda belgelendi).
 *
 * Kullanım: controller içinde `enforce(bucket, key)` çağrısı — limit aşımında
 * DomainError 429 RATE_LIMITED fırlatır. Doğrudan servis olarak test edilebilir
 * (saat enjeksiyonu: `now` parametresi).
 */
import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors';

const MAX_BUCKETS = 10_000; // Bellek sınırlaması: en eski kova düşürülür.

@Injectable()
export class RateLimiterService {
  private readonly hits = new Map<string, number[]>();

  /**
   * `bucket:${key}` için `windowMs` içinde `max` izin. Aşım → 429.
   * Döner: kalan izin sayısı (yanıt üst bilgisi için).
   */
  enforce(
    bucket: string,
    key: string,
    max: number,
    windowMs: number,
    now: number = Date.now(),
  ): number {
    const id = `${bucket}:${key}`;
    const windowStart = now - windowMs;

    const list = this.hits.get(id);
    const fresh = (list ?? []).filter((t) => t > windowStart);
    if (fresh.length >= max) {
      // İstemciye dürüst sinyal: tekrar deneme süresi (sn).
      const retryAfter = Math.ceil((fresh[0]! + windowMs - now) / 1000);
      throw DomainError.tooManyRequests(
        'RATE_LIMIT_EXCEEDED',
        'errors.rateLimited',
        { retryAfterSeconds: Math.max(retryAfter, 1) },
      );
    }
    fresh.push(now);
    this.hits.set(id, fresh);

    if (this.hits.size > MAX_BUCKETS) this.evictOldest(now - windowMs);
    return max - fresh.length;
  }

  /** Testler için: tüm sayaçları sıfırla. */
  reset(): void {
    this.hits.clear();
  }

  private evictOldest(cutoff: number): void {
    for (const [id, list] of this.hits) {
      const fresh = list.filter((t) => t > cutoff);
      if (fresh.length === 0) this.hits.delete(id);
      else this.hits.set(id, fresh);
      if (this.hits.size <= MAX_BUCKETS) break;
    }
  }
}
