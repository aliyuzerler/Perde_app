/**
 * secure-storage testleri — Teknik Kural 3 kanıtı:
 *  1) setItem SecureStore'a (Keychain/Keystore) YAZAR; keychainAccessible
 *     WHEN_UNLOCKED_THIS_DEVICE_ONLY ile istenir (cihazdan çıkarma koruması).
 *  2) getItem SecureStore'dan okur.
 *  3) SecureStore kullanılamazsa (web) bellek düşüşü devreye girer; değer
 *     korunur (veri kaybı yok, AsyncStorage'a sızma yok).
 *  4) removeItem her iki katmanı da temizler.
 */
import { jest, describe, expect, it, beforeEach } from '@jest/globals';
import { Platform } from 'react-native';
import { secureStorage } from '../secure-storage';

const mockStore = new Map<string, string>();
const mockSetItemAsync = jest.fn(async (key: string, value: string, _options?: unknown) => {
  mockStore.set(key, value);
});
const mockGetItemAsync = jest.fn(async (key: string) => mockStore.get(key) ?? null);
const mockDeleteItemAsync = jest.fn(async (key: string) => {
  mockStore.delete(key);
});

jest.mock('expo-secure-store', () => ({
  setItemAsync: (...args: unknown[]) =>
    mockSetItemAsync(...(args as [string, string, unknown])),
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...(args as [string])),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...(args as [string])),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
}));

describe('secure-storage', () => {
  beforeEach(() => {
    mockStore.clear();
    mockSetItemAsync.mockClear();
    mockGetItemAsync.mockClear();
    mockDeleteItemAsync.mockClear();
  });

  it('setItem SecureStore\u2019a yazar; parola-niteliğinde keychain ayarı istenir', async () => {
    await secureStorage.setItem('perdego.auth.v2', '{"session":{}}');
    expect(mockSetItemAsync).toHaveBeenCalledWith('perdego.auth.v2', '{"session":{}}', {
      keychainAccessible: 'whenUnlockedThisDeviceOnly',
    });
    expect(mockStore.get('perdego.auth.v2')).toBe('{"session":{}}');
  });

  it('getItem SecureStore\u2019daki değeri döndürür', async () => {
    mockStore.set('k', 'v');
    await expect(secureStorage.getItem('k')).resolves.toBe('v');
  });

  it('SecureStore kullanılamazsa (web) bellek düşüşü değeri korur', async () => {
    mockSetItemAsync.mockRejectedValueOnce(new Error('web: native modül yok'));
    await secureStorage.setItem('anahtar', 'bellek-değeri');
    expect(mockStore.has('anahtar')).toBe(false);
    await expect(secureStorage.getItem('anahtar')).resolves.toBe('bellek-değeri');
  });

  it('removeItem bellek önbelleğini ve SecureStore kaydını temizler', async () => {
    await secureStorage.setItem('anahtar', 'değer');
    await secureStorage.removeItem('anahtar');
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('anahtar');
    await expect(secureStorage.getItem('anahtar')).resolves.toBeNull();
  });

  // F2C-01: web'de oturum kalıcılığı — localStorage gerçek deposudur.
  describe('web platformu (F2C-01)', () => {
    const ls = new Map<string, string>();
    const localStorageMock = {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    } as unknown as Storage;

    beforeEach(() => {
      ls.clear();
      (Platform as { OS: string }).OS = 'web';
      (globalThis as { window?: unknown }).window = { localStorage: localStorageMock };
    });

    it('setItem localStorage\u2019a yazar; SecureStore çağrılmaz', async () => {
      await secureStorage.setItem('perdego.auth.v2', '{"session":{}}');
      expect(ls.get('perdego.auth.v2')).toBe('{"session":{}}');
      expect(mockSetItemAsync).not.toHaveBeenCalled();
    });

    it('getItem localStorage\u2019dan okur (sayfa yenileme senaryosu)', async () => {
      ls.set('perdego.auth.v2', '{"session":{"user":{"id":"u1"}}}');
      await expect(secureStorage.getItem('perdego.auth.v2')).resolves.toBe(
        '{"session":{"user":{"id":"u1"}}}'
      );
    });

    it('removeItem localStorage kaydını temizler', async () => {
      ls.set('perdego.auth.v2', 'x');
      await secureStorage.removeItem('perdego.auth.v2');
      expect(ls.has('perdego.auth.v2')).toBe(false);
    });

    it('localStorage yoksa (gizli pencere) bellek düşüşü değeri korur', async () => {
      (globalThis as { window?: unknown }).window = {};
      await secureStorage.setItem('k', 'v');
      await expect(secureStorage.getItem('k')).resolves.toBe('v');
    });
  });
});
