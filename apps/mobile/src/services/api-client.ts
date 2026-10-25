/**
 * REST API istemcisi (Faz 3b: kimlik + otomatik refresh).
 *
 * - Tüm yanıtlar `ApiEnvelope` zarfını bekler ve doğrular.
 * - Authorization başlığı `getAccessToken` ile enjekte edilir.
 * - 401 (TOKEN_EXPIRED/UNAUTHORIZED) → TEK uçuşta refresh denemesi, başarıda
 *   istek bir kez tekrarlanır; paralel istekler tek refresh'i paylaşır.
 *   Refresh başarısızsa `onSessionExpired` tetiklenir (güvenli yönlendirme
 *   kök layout'ta yapılır; istemci katmanı rota bilmez).
 * - Ağ/hata durumlarını tip güvenli `ApiClientError` tipine çevirir.
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
  /** Sunucu `details.reason` alanı (örn. EMAIL_NOT_VERIFIED, REFRESH_REUSED). */
  readonly reason?: string;
  /** E-posta doğrulama gereksinimi (kullanıcıyı doğru akışa yönlendirme). */
  readonly emailNotVerified: boolean;

  constructor(kind: ApiErrorKind, message: string, code?: ApiErrorCode, reason?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.kind = kind;
    this.code = code;
    this.reason = reason;
    this.emailNotVerified = reason === 'EMAIL_NOT_VERIFIED';
  }

  /** Kullanıcıya "bağlantı yok" durumu mu gösterilecek. */
  get isNetworkFailure(): boolean {
    return this.kind === 'network';
  }
}

interface ApiClientOptions {
  baseUrl: string;
  /** Her istekte güncel access token (auth-store'dan okunur). */
  getAccessToken?: () => string | null;
  /** 401 sonrası tek seferlik refresh. null → refresh yapılamaz. */
  refresh?: () => Promise<boolean>;
  /** Refresh de başarısız olduğunda (oturum sunucuda öldü). */
  onSessionExpired?: () => void;
  timeoutMs?: number;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: () => string | null;
  private readonly refresh?: () => Promise<boolean>;
  private readonly onSessionExpired?: () => void;
  private readonly timeoutMs: number;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.getAccessToken = options.getAccessToken;
    this.refresh = options.refresh;
    this.onSessionExpired = options.onSessionExpired;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  get<TData>(path: string): Promise<TData> {
    return this.request<TData>('GET', path);
  }

  post<TData>(path: string, body?: unknown): Promise<TData> {
    return this.request<TData>('POST', path, body);
  }

  patch<TData>(path: string, body?: unknown): Promise<TData> {
    return this.request<TData>('PATCH', path, body);
  }

  put<TData>(path: string, body?: unknown): Promise<TData> {
    return this.request<TData>('PUT', path, body);
  }

  delete<TData>(path: string): Promise<TData> {
    return this.request<TData>('DELETE', path);
  }

  /**
   * multipart/form-data istekleri (avatar yükleme). JSON header'ları atlanır.
   */
  async upload<TData>(path: string, formData: FormData): Promise<TData> {
    return this.rawRequest<TData>('POST', path, undefined, formData);
  }

  private async request<TData>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<TData> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    try {
      return await this.rawRequest<TData>(method, path, headers, body, retried);
    } catch (error) {
      // Access token süresi dolduysa tek seferlik refresh + tek tekrar.
      const expired =
        !retried &&
        error instanceof ApiClientError &&
        error.kind === 'client' &&
        error.code === 'UNAUTHORIZED' &&
        this.getAccessToken?.() != null &&
        this.refresh != null &&
        path !== '/auth/refresh' &&
        path !== '/auth/login' &&
        path !== '/auth/register';
      if (!expired) throw error;

      const ok = await this.refreshOnce();
      if (!ok) throw error;
      return this.request<TData>(method, path, body, true);
    }
  }

  /** Tek uçuş: paralel 401'ler tek refresh paylaştırır (token ailesi güvenliği). */
  private refreshOnce(): Promise<boolean> {
    if (!this.refresh) return Promise.resolve(false);
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async rawRequest<TData>(
    method: HttpMethod,
    path: string,
    jsonHeaders?: Record<string, string>,
    body?: unknown,
    retried = false,
  ): Promise<TData> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = { ...(jsonHeaders ?? {}) };
    const token = this.getAccessToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiClientError('network', 'Network request failed');
    } finally {
      clearTimeout(timeout);
    }

    try {
      return await this.parseResponse<TData>(response);
    } catch (error) {
      // Refresh sonrası da 401: oturum sunucuda tümden geçersiz.
      if (
        retried &&
        error instanceof ApiClientError &&
        error.code === 'UNAUTHORIZED'
      ) {
        this.onSessionExpired?.();
      }
      throw error;
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
      const details = envelope.error?.details as
        | { reason?: unknown }
        | undefined;
      const reason =
        parsedError.success && details && typeof details.reason === 'string'
          ? details.reason
          : undefined;
      const code = parsedError.success ? parsedError.data.code : undefined;
      const message = parsedError.success
        ? parsedError.data.message
        : 'Bilinmeyen sunucu hatası';
      throw new ApiClientError(
        response.status >= 500 ? 'server' : 'client',
        message,
        code,
        reason
      );
    }

    throw new ApiClientError('server', 'Geçersiz yanıt zarfı');
  }
}
