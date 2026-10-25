/**
 * Kök yerleşim: sağlayıcı zinciri ve Stack tanımı.
 * Ekranlar burada iş mantığı içermez; veri katmanına yalnızca hook'larla erişir.
 * Açılış (onboarding) kapısı ekran düzeyindedir: (tabs)/index.tsx.
 * Faz 3b: oturum süresi dolduğunda güvenli yönlendirme burada yapılır
 * (onSessionExpired olayı api-client refresh akışından gelir).
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from '@/theme';
import { I18nProvider } from '@/i18n';
import { usePreferencesStore } from '@/store/preferences-store';
import { useAuthStore } from '@/store/auth-store';
import { registerSessionGuard } from '@/services/session-guard';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Providers({ children }: { children: ReactNode }) {
  const locale = usePreferencesStore((state) => state.locale);
  return (
    <ThemeProvider>
      <I18nProvider locale={locale}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { theme } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.session !== null);
  const guardRef = useRef<ReturnType<typeof registerSessionGuard> | null>(null);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {
      /* yoksay */
    });
  }, []);

  // Oturum süresi doldu → güvenli yönlendirme (Mobil kural). Yalnızca oturumu
  // OLAN kullanıcı etkilenir; misafir akışında olay tetiklenmez. Tek seferlik
  // yönlendirme: guard bir kez attıktan sonra oturum açılana dek bekle.
  useEffect(() => {
    if (!isAuthenticated) {
      guardRef.current?.dispose();
      guardRef.current = null;
      return;
    }
    guardRef.current = registerSessionGuard(() => {
      router.replace({
        pathname: '/auth/login',
        params: { reason: 'session-expired' },
      });
    });
    return () => {
      guardRef.current?.dispose();
      guardRef.current = null;
    };
  }, [isAuthenticated]);

  // NOT: Açılış (onboarding) kapısı buradan KALDIRILDI (FAZ-2 QA bulgusu).
  // expo-router v58 web'de, gezgin yerine geçecek şekilde kök layout'ta
  // render edilen <Redirect> sonsuz güncelleme döngüsüne giriyor (initial
  // state seed'i tamamlanamıyor). Kapı, gezgin mount iken güvenli olan ekran
  // düzeyi desene taşındı: (tabs)/index.tsx.
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="content/[id]" />
        <Stack.Screen
          name="player/[episodeId]"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="paywall"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="credits"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="category/[slug]" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/register" />
        <Stack.Screen name="auth/forgot-password" />
        <Stack.Screen name="auth/reset-password" />
        <Stack.Screen name="auth/verify-email" />
        <Stack.Screen name="auth/verify-email-notice" />
        <Stack.Screen name="account/edit-profile" />
        <Stack.Screen name="account/change-password" />
        <Stack.Screen name="account/sessions" />
        <Stack.Screen name="account/delete-account" />
        <Stack.Screen name="legal/[doc]" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <Providers>
      <RootNavigator />
    </Providers>
  );
}
