/**
 * Alan (domain) hatası: HTTP durumu + sözleşme hata kodu + i18n mesaj
 * anahtarı + makine okunabilir reason taşır (API_CONTRACT §10).
 *
 * Kural: Hata yanıtları her zaman ApiEnvelope biçimindedir:
 *   { ok: false, error: { code, message, details } }
 * `message` istemcinin çevirebileceği anahtardır; ham sunucu hatası
 * asla sızdırılmaz.
 */
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYMENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'SERVICE_UNAVAILABLE';

export interface DomainErrorOptions {
  /** HTTP durum kodu (400/401/402/403/404/409/429/500/503). */
  status: number;
  code: ApiErrorCode;
  /** Kullanıcıya gösterilebilir çeviri anahtarı. */
  messageKey: string;
  /** Makine okunabilir neden (örn. NEEDS_CREDITS). */
  reason?: string;
  details?: Record<string, unknown>;
}

export class DomainError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly reason?: string;
  readonly details?: Record<string, unknown>;

  constructor(options: DomainErrorOptions) {
    super(options.messageKey);
    this.name = 'DomainError';
    this.status = options.status;
    this.code = options.code;
    this.reason = options.reason;
    this.details = options.details;
  }

  /** Sık kullanılan hata fabrikaları (API_CONTRACT §10 tablosu). */
  static badRequest(reason: string, messageKey: string, details?: Record<string, unknown>): DomainError {
    return new DomainError({ status: 400, code: 'BAD_REQUEST', messageKey, reason, details });
  }

  static unauthorized(reason: string, messageKey: string, details?: Record<string, unknown>): DomainError {
    return new DomainError({ status: 401, code: 'UNAUTHORIZED', messageKey, reason, details });
  }

  static forbidden(reason: string, messageKey: string, details?: Record<string, unknown>): DomainError {
    return new DomainError({ status: 403, code: 'FORBIDDEN', messageKey, reason, details });
  }

  static notFound(reason: string, messageKey: string, details?: Record<string, unknown>): DomainError {
    return new DomainError({ status: 404, code: 'NOT_FOUND', messageKey, reason, details });
  }

  static conflict(reason: string, messageKey: string, details?: Record<string, unknown>): DomainError {
    return new DomainError({ status: 409, code: 'CONFLICT', messageKey, reason, details });
  }

  static paymentRequired(reason: string, messageKey: string, details?: Record<string, unknown>): DomainError {
    return new DomainError({ status: 402, code: 'PAYMENT_REQUIRED', messageKey, reason, details });
  }
}
