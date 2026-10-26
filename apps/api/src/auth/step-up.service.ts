/**
 * Adım-yukarı (step-up) doğrulama servisi — FAZ 8.
 *
 * Amaç: kritik yönetim işlemlerinde (finansal alan değişikliği, rol/durum
 * değişikliği, kampanya gönderimi) parolayla YENİDEN kimlik doğrulama.
 *
 * Tasarım:
 *  - POST /auth/step-up (girişli oturum) doğru parolayla kısa ömürlü
 *    (5 dk) step-up token'ı üretir.
 *  - Token durumsuzdur: payload {sub, typ:'stepup', exp} + HMAC-SHA256.
 *    HMAC anahtarı RS256 özel anahtarı PEM'inden türetilir (yeni env
 *    gerektirmez; özel anahtar zaten sırdır).
 *  - Token yalnızca ÜRETEN kullanıcıya bağlıdır (sub eşleşmesi zorunlu) —
 *    başka bir yöneticinin token'ı taşınamaz.
 *  - Yanıt 401 STEP_UP_REQUIRED / 403 STEP_UP_INVALID ile ayrışır.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { DomainError } from '../common/errors';

export const STEP_UP_TTL_SECONDS = 300; // 5 dakika
const STEP_UP_PREFIX = 'stup1'; // versiyonlu token zarfı

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

@Injectable()
export class StepUpService {
  private readonly hmacKey: Buffer;

  constructor(@Inject(ENV) env: Env) {
    // RS256 özel anahtarı sırdır; HMAC anahtarı ondan türetilir (DOMİNE
    // AYRIŞMA: aynı gizli farklı algoritma amacıyla türetilerek kullanılır).
    this.hmacKey = createHash('sha256')
      .update(`perdego-step-up:${env.JWT_ACCESS_PRIVATE_KEY ?? ''}`)
      .digest();
  }

  /** Oturum kullanıcısı için step-up token üretir. */
  issueToken(userId: string): { stepUpToken: string; expiresIn: number } {
    const exp = Math.floor(Date.now() / 1000) + STEP_UP_TTL_SECONDS;
    const payload = b64url(Buffer.from(JSON.stringify({ sub: userId, typ: 'stepup', exp })));
    const sig = b64url(createHmac('sha256', this.hmacKey).update(payload).digest());
    return { stepUpToken: `${STEP_UP_PREFIX}.${payload}.${sig}`, expiresIn: STEP_UP_TTL_SECONDS };
  }

  /**
   * Token'ı doğrular; geçersiz/süresi dolmuşsa 403 fırlatır.
   * expectedUserId verilirse token'ın sahibiyle eşleşmesi zorunludur.
   */
  verify(token: string | undefined | null, expectedUserId: string): void {
    if (!token || !token.startsWith(`${STEP_UP_PREFIX}.`)) {
      throw DomainError.unauthorized('STEP_UP_REQUIRED', 'errors.stepUpRequired');
    }
    const [, payload, sig] = token.split('.');
    if (!payload || !sig) {
      throw DomainError.unauthorized('STEP_UP_REQUIRED', 'errors.stepUpRequired');
    }
    const expectedSig = createHmac('sha256', this.hmacKey).update(payload).digest();
    const actualSig = Buffer.from(sig, 'base64url');
    if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
      throw DomainError.forbidden('STEP_UP_INVALID', 'errors.stepUpInvalid');
    }
    let parsed: { sub?: string; typ?: string; exp?: number };
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw DomainError.forbidden('STEP_UP_INVALID', 'errors.stepUpInvalid');
    }
    if (parsed.typ !== 'stepup' || typeof parsed.exp !== 'number' || parsed.exp * 1000 < Date.now()) {
      throw DomainError.forbidden('STEP_UP_INVALID', 'errors.stepUpInvalid');
    }
    if (!parsed.sub || parsed.sub !== expectedUserId) {
      throw DomainError.forbidden('STEP_UP_INVALID', 'errors.stepUpInvalid');
    }
  }
}
