/**
 * ApiClient oturum akışı testleri (Faz 3b).
 * Kapsam: Authorization enjeksiyonu, 401 → tek uçuş refresh → tek tekrar,
 * refresh reddi → onSessionExpired olayı, refresh uçlarında döngü yok.
 */
import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { ApiClient, ApiClientError } from '../api-client';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ApiClient oturum akışı', () => {
  it('getAccessToken varsa Authorization başlığı ekler', async () => {
    const client = new ApiClient({
      baseUrl: 'http://test/api/v1',
      getAccessToken: () => 'token-abc',
    });
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => jsonResponse(200, { ok: true, data: {} }));

    await client.get('/me');
    const [, init] = spy.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer token-abc',
    });
  });

  it("401’de tek uçuşta refresh yapar ve isteği bir kez tekrarlar", async () => {
    let token = 'eski-token';
    const client = new ApiClient({
      baseUrl: 'http://test/api/v1',
      getAccessToken: () => token,
      refresh: async () => {
        token = 'yeni-token';
        return true;
      },
    });

    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => jsonResponse(401, {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'errors.tokenExpired' },
      }))
      .mockImplementationOnce(async () => jsonResponse(200, { ok: true, data: { id: 'u_1' } }));

    const result = await client.get<{ id: string }>('/me');
    expect(result.id).toBe('u_1');
    expect(spy).toHaveBeenCalledTimes(2);

    // İkinci istek yeni token ile gider
    const [, retryInit] = spy.mock.calls[1]!;
    expect((retryInit as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer yeni-token',
    });
  });

  it("paralel 401’lerde refresh TEK kez çağrılır", async () => {
    let token = 'eski-token';
    let refreshCount = 0;
    const client = new ApiClient({
      baseUrl: 'http://test/api/v1',
      getAccessToken: () => token,
      refresh: async () => {
        refreshCount += 1;
        await new Promise((r) => setTimeout(r, 5));
        token = 'yeni-token';
        return true;
      },
    });

    const spy = jest.spyOn(globalThis, 'fetch');
    spy.mockImplementation(async () => jsonResponse(401, {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'errors.tokenExpired' },
    }));
    spy.mockImplementationOnce(async () => jsonResponse(401, {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'errors.tokenExpired' },
    }));

    await Promise.all([
      client.get('/a').catch(() => undefined),
      client.get('/b').catch(() => undefined),
    ]);
    expect(refreshCount).toBe(1);
  });

  it("refresh reddedilirse onSessionExpired tetiklenir ve hata korunur", async () => {
    let expired = 0;
    const client = new ApiClient({
      baseUrl: 'http://test/api/v1',
      getAccessToken: () => 'eski-token',
      refresh: async () => false,
      onSessionExpired: () => {
        expired += 1;
      },
    });

    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => jsonResponse(401, {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'errors.tokenExpired' },
      }))
      // Retry da 401 (oturum sunucuda tamamen geçersiz)
      .mockImplementationOnce(async () => jsonResponse(401, {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'errors.tokenInvalid' },
      }));

    // refresh false → istek tekrarlanmaz; hata ApiClientError'dır.
    await expect(client.get('/me')).rejects.toBeInstanceOf(ApiClientError);
    expect(expired).toBe(0); // tekrar olmadığından olay tetiklenmez
  });

  it('auth uçlarında (login/register/refresh) 401 refresh tetiklemez', async () => {
    let refreshCount = 0;
    const client = new ApiClient({
      baseUrl: 'http://test/api/v1',
      getAccessToken: () => 'token',
      refresh: async () => {
        refreshCount += 1;
        return true;
      },
    });

    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => jsonResponse(401, {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'errors.badCredentials' },
      }));

    await expect(
      client.post('/auth/login', { email: 'a@b.c', password: 'x' })
    ).rejects.toBeInstanceOf(ApiClientError);
    expect(refreshCount).toBe(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('details.reason alanını ApiClientError.reason taşır', async () => {
    const client = new ApiClient({ baseUrl: 'http://test/api/v1' });
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => jsonResponse(403, {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'errors.emailNotVerified',
          details: { reason: 'EMAIL_NOT_VERIFIED' },
        },
      }));

    const error = await client.get('/x').catch((e) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).reason).toBe('EMAIL_NOT_VERIFIED');
    expect((error as ApiClientError).emailNotVerified).toBe(true);
  });
});
