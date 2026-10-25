/**
 * RateLimiterService birim testleri — kayan pencere davranışı saat enjeksiyonu
 * ile belirlenir (bekleme yok, deterministik).
 */
import { describe, expect, it } from 'vitest';
import { RateLimiterService } from './rate-limit.service';
import { DomainError } from '../common/errors';

describe('RateLimiterService', () => {
  it('pencere içinde max izin sayar; aşım 429 RATE_LIMITED fırlatır', () => {
    const limiter = new RateLimiterService();
    let now = 1_000_000;

    for (let i = 0; i < 3; i += 1) {
      const remaining = limiter.enforce('login', '1.2.3.4', 3, 60_000, now);
      expect(remaining).toBe(3 - i - 1);
      now += 1000;
    }

    expect(() => limiter.enforce('login', '1.2.3.4', 3, 60_000, now)).toThrowError(DomainError);
    try {
      limiter.enforce('login', '1.2.3.4', 3, 60_000, now);
    } catch (error) {
      const domain = error as DomainError;
      expect(domain.status).toBe(429);
      expect(domain.code).toBe('RATE_LIMITED');
      expect(domain.reason).toBe('RATE_LIMIT_EXCEEDED');
      expect((domain.details as { retryAfterSeconds?: number }).retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('pencere kayar: eski izinler düştükçe yeni istekler kabul edilir', () => {
    const limiter = new RateLimiterService();
    let now = 2_000_000;
    for (let i = 0; i < 5; i += 1) {
      limiter.enforce('reset', 'ip-x', 5, 60_000, now);
      now += 1000;
    }
    expect(() => limiter.enforce('reset', 'ip-x', 5, 60_000, now)).toThrowError(DomainError);

    // Kayan pencere: t > (now - 60sn) koşuluyla ilk iki izin düşer, üçü kalır.
    now = 2_000_000 + 61_000;
    expect(limiter.enforce('reset', 'ip-x', 5, 60_000, now)).toBe(1);
  });

  it('kova anahtarı izolasyonlu: farklı IP ve bucket etkilenmez', () => {
    const limiter = new RateLimiterService();
    const now = 3_000_000;
    for (let i = 0; i < 3; i += 1) limiter.enforce('login', 'ip-a', 3, 60_000, now);
    expect(() => limiter.enforce('login', 'ip-b', 3, 60_000, now)).not.toThrow();
    expect(() => limiter.enforce('register', 'ip-a', 3, 60_000, now)).not.toThrow();
  });

  it('reset tüm sayaçları temizler', () => {
    const limiter = new RateLimiterService();
    const now = 4_000_000;
    for (let i = 0; i < 3; i += 1) limiter.enforce('login', 'ip-c', 3, 60_000, now);
    limiter.reset();
    expect(limiter.enforce('login', 'ip-c', 3, 60_000, now)).toBe(2);
  });
});
