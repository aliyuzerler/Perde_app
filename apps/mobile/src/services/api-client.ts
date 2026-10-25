/**
 * REST API istemcisi.
 *
 * - Tüm yanıtlar `ApiEnvelope` zarfını bekler ve doğrular.
 * - Ağ/hata durumlarını tip güvenli `ApiClientError` tipine çevirir.
 * - Ekranlar ve hook'lar doğrudan fetch kullanmaz; bu istemci ya da üstü
 *   katmanlardan geçer (Genel Kural 5).
 */
import {
  apiErrorSchema,
  type ApiEnvelope,
  type ApiErrorCode,
} from '@perdego/contracts';

export type ApiErrorKind = 'network' | 'server' | 'client';

export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  readonly code?: ApiErrorCode;

  constructor(kind: ApiErrorKind, message: string, code?: ApiErrorCode) {
    super(message);
    this.name = 'ApiClientError';
    this.kind = kind;
    this.code = code;
  }

  /** Kullanıcıya "bağlantı yok" durumu mu gösterilecek. */
  get isNetworkFailure(): boolean {
    return this.kind === 'network';
  }
}

interface ApiClientOptions {
  baseUrl: string;
  /** Faz 3'te buraya access token eklenir. */
  getAccessToken?: () => string | null;
  timeoutMs?: number;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: () => string | null;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.getAccessToken = options.getAccessToken;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  async get<TData>(path: string): Promise<TData> {
    return this.request<TData>('GET', path);
  }

  async post<TData>(path: string, body?: unknown): Promise<TData> {
    return this.request<TData>('POST', path, body);
  }

  private async request<TData>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<TData> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      const token = this.getAccessToken?.();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      return await this.parseResponse<TData>(response);
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }
      // AbortError ve diğer ağ katmanı hataları network olarak sınıflandırılır.
      throw new ApiClientError('network', 'Network request failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseResponse<TData>(response: Response): Promise<TData> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiClientError(
        response.ok ? 'server' : 'client',
        'Yanıt gövdesi okunamadı'
      );
    }

    const envelope = payload as ApiEnvelope<TData> | undefined;
    if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
      if (envelope.ok === true) {
        if (!response.ok) {
          throw new ApiClientError('server', 'Beklenmeyen yanıt durumu');
        }
        return envelope.data;
      }
      const parsedError = apiErrorSchema.safeParse(envelope.error);
      const code = parsedError.success ? parsedError.data.code : undefined;
      const message = parsedError.success
        ? parsedError.data.message
        : 'Bilinmeyen sunucu hatası';
      throw new ApiClientError(
        response.status >= 500 ? 'server' : 'client',
        message,
        code
      );
    }

    throw new ApiClientError('server', 'Geçersiz yanıt zarfı');
  }
}
