/**
 * Güvenli oturum depolaması (Teknik Kural 3).
 *
 * - Native (iOS/Android): expo-secure-store — iOS Keychain / Android
 *   Keystore ile şifreli saklama. access/refresh token BURAYA yazılır;
 *   AsyncStorage token için kullanılmaz (yalnızca UI tercihleri orada).
 * - Web (Expo web geliştirmesi): expo-secure-store web'de sınırlıdır;
 *   localStorage'a düşer (geliştirme kabulü — production hedefi nativedir).
 *
 * API küçük tutulur: getItem/setItem/removeItem (string değer).
 */
import * as SecureStore from 'expo-secure-store';

const memoryCache = new Map<string, string>();

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await SecureStore.getItemAsync(key);
      return value ?? memoryCache.get(key) ?? null;
    } catch {
      // Web/uygulama kısıtı: bellek içi düşüş (oturum kalıcılığı geliştirmede
      // azalır ama veri asla AsyncStorage'a sızdırılmaz).
      return memoryCache.get(key) ?? null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    memoryCache.set(key, value);
    try {
      await SecureStore.setItemAsync(key, value, {
        // Parola niteliğinde veri: iCloud yedeklerine düşürmeden cihazda tut.
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch {
      // Web: sessiz düşüş — bellek içi değeri koruduk.
    }
  },

  async removeItem(key: string): Promise<void> {
    memoryCache.delete(key);
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Yoksay: bellek örneği zaten temiz.
    }
  },
};
