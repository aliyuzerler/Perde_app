/**
 * Push token kayıt akışı (FAZ 9).
 *
 * - Yalnız gerçek cihazda çalışır (simülatörde Expo push token üretilemez —
 *   iOS simulator APNs kaydı yapmaz; docs/PUSH_SETUP.md §3).
 * - Expo Go Android SDK 53+ push desteklemez → dürüst desteklenmez yanıtı.
 * - Token her uygulama açılışında yeniden upsert edilir (Expo token'ı
 *   değişebilir — yenileme yolu); API upsert olduğu için idempotenttir.
 * - İzin reddedilirse REDDEDILDI durumu döner; uygulama tekrar istermez
 *   (kullanıcıyı sistem ayarlarına yönlendirmek ekranın işidir).
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { ContentApiPort } from '../ports';

export type PushRegistrationStatus =
  | 'REGISTERED'
  | 'PERMISSION_DENIED'
  | 'UNSUPPORTED'
  | 'TOKEN_UNAVAILABLE'
  | 'FAILED';

export interface PushRegistrationResult {
  status: PushRegistrationStatus;
  /** REGISTERED ise cihaz kayıt yanıtı (maskeli token). */
  deviceId?: string;
  detail?: string;
}

/** Push mesajlarının ön planda nasıl gösterileceği (ses + uyarı). */
export function configureForegroundPresentation(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * İzin ister, Expo push token'ı alır ve backend'e kaydeder.
 * EXPO_PUBLIC_EAS_PROJECT_ID tanımlı olmalı (EAS proje kimliği —
 * docs/PUSH_SETUP.md §2). Yalnızca oturum AÇIK kullanıcı için çağırın.
 */
export async function registerPushToken(
  api: Pick<ContentApiPort, 'registerDeviceToken'>,
  locale: 'tr' | 'en',
): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    // Simülatörde APNs/FCM kaydı yok — dürüst desteklenmez durumu.
    return { status: 'UNSUPPORTED', detail: 'simulator' };
  }
  if (Platform.OS === 'android' && Constants.appOwnership === 'expo') {
    // Expo Go (Android) SDK 53+ push desteklemiyor — dev build gerekir.
    return { status: 'UNSUPPORTED', detail: 'expo-go-android' };
  }

  const permission = await Notifications.getPermissionsAsync();
  let granted = permission.status === 'granted';
  if (!granted) {
    const ask = await Notifications.requestPermissionsAsync();
    granted = ask.status === 'granted';
  }
  if (!granted) {
    return { status: 'PERMISSION_DENIED' };
  }

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
      ?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId || typeof projectId !== 'string') {
    return { status: 'TOKEN_UNAVAILABLE', detail: 'EAS projectId tanımlı değil (PUSH_SETUP §2)' };
  }

  let token: string;
  try {
    // expo-notifications 58: projectId app config'ten (extra.eas.projectId)
    // okunur; yukarıdaki açık kontrol yalnızca anlaşılır hata içindir.
    const tokenResponse = await Notifications.getDevicePushTokenAsync();
    token =
      typeof tokenResponse.data === 'string'
        ? tokenResponse.data
        : ((tokenResponse.data as { expoPushToken?: string } | undefined)?.expoPushToken ?? '');
  } catch (err) {
    return { status: 'TOKEN_UNAVAILABLE', detail: String(err).slice(0, 140) };
  }
  if (!token) {
    return { status: 'TOKEN_UNAVAILABLE', detail: 'boş token' };
  }

  try {
    const device = await api.registerDeviceToken({
      platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
      pushToken: token,
      appVersion: Constants.expoConfig?.version ?? undefined,
      locale,
    });
    return { status: 'REGISTERED', deviceId: device.id };
  } catch (err) {
    return { status: 'FAILED', detail: String(err).slice(0, 140) };
  }
}

/**
 * Bildirim yanıtı (dokunma) → derin bağlantı. Uygulama ölüyken dokunulan
 * bildirim bu yolla yakalanır (soğuk başlangıç senaryosu).
 */
export async function consumeInitialNotification(): Promise<Notifications.NotificationResponse | null> {
  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch {
    return null;
  }
}
