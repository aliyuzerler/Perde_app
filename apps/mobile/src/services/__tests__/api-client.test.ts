/** API istemcisi zarf (envelope) ayrıştırma testleri. */
import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { ApiClient, ApiClientError } from '../api-client';

const client = new ApiClient({ baseUrl: 'http://localhost:3000/api/v1' });

function mockFetchOnce(payload: unknown, { ok = true, status = 200 } = {}) {
  const response = {
    ok,
    status,
    json: async () => payload,
  };
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementationOnce(async () => response as unknown as Response);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ApiClient.get', () => {
  it('başarılı zarftan data alanını döner', async () => {
    mockFetchOnce({ ok: true, data: { sections: [] } });
    const result = await client.get<{ sections: unknown[] }>('/feed');
    expect(result).toEqual({ sections: [] });
  });

  it('hata zarfında ApiClientError fırlatır ve kodu taşır', async () => {
    mockFetchOnce(
      { ok: false, error: { code: 'NOT_FOUND', message: 'İçerik bulunamadı' } },
      { ok: false, status: 404 }
    );
    await expect(client.get('/content/x')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'NOT_FOUND',
    });
  });

  it('geçersiz zarfta server hatası fırlatır', async () => {
    mockFetchOnce({unexpected: true});
    await expect(client.get('/feed')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('ağ hatasında network türüyle sınıflandırılır', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => {
        throw new TypeError('Network request failed');
      });
    try {
      await client.get('/feed');
      throw new Error('hata beklenmişti');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).isNetworkFailure).toBe(true);
    }
  });
});
