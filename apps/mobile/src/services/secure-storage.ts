/**
 * Güvenli oturum depolaması (Teknik Kural 3).
 *
 * - Native (iOS/Android): expo-secure-store — iOS Keychain / Android
 *   Keystore ile şifreli saklama. access/refresh token BURAYA yazılır;
 *   AsyncStorage token için kullanılmaz (yalnızca UI tercihleri orada).
 * - Web (Expo web geliştirmesi): expo-secure-store web'de modül yöntemleri
 *   fırlatır; bu nedenle localStorage kullanılır (geliştirme kabulü —
 *   production hedefi nativedir). localStorage erişilemezse (gizli pencere,
 *   kota) bellek içi düşüş devreye girer; oturum sayfa yenilemede kaybolur.
 *
 * F2C-01 düzeltmesi: web düşüşü daha önce yalnızca bellek danışığıydı —
 * sayfa yenilemesinde oturum kayboluyordu (başlık metni 'localStorage'a
 * düşer' diyordu ama kod uygulamıyordu). Artık web'de gerçekten
 * localStorage'a yazılır/okunur; native davranış değişmedi.
 *
 * API küçük tutulur: getItem/setItem/removeItem (string değer).
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const memoryCache = new Map<string, string>();

/** Web'de localStorage erişimi (SSR / engelli pencere durumlarında null). */
function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    if (typeof window === 'undefined' || window.localStorage == null) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      const ls = webStorage();
      if (ls) {
        try {
          return ls.getItem(key);
        } catch {
          // okuma engelli → bellek
        }
      }
      return memoryCache.get(key) ?? null;
    }
    try {
      const value = await SecureStore.getItemAsync(key);
      return value ?? memoryCache.get(key) ?? null;
    } catch {
      // Native kısıtı: bellek içi düşüş (oturum sayfa ömrü kadar yaşar).
      return memoryCache.get(key) ?? null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    // Bellek danışığı her platformda güncel kalır (okuma senkron hızda).
    memoryCache.set(key, value);
    if (Platform.OS === 'web') {
      const ls = webStorage();
      if (ls) {
        try {
          ls.setItem(key, value);
        } catch {
          // Kota/güvenlik reddi → bellek danışığı yaşamaya devam eder.
        }
      }
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value, {
        // Parola niteliğinde veri: iCloud yedeklerine düşürmeden cihazda tut.
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch {
      // Native yazma hatası: bellek içi değeri koruduk.
    }
  },

  async removeItem(key: string): Promise<void> {
    memoryCache.delete(key);
    if (Platform.OS === 'web') {
      const ls = webStorage();
      if (ls) {
        try {
          ls.removeItem(key);
        } catch {
          // yoksay
        }
      }
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Yoksay: bellek örneği zaten temiz.
    }
  },
};
