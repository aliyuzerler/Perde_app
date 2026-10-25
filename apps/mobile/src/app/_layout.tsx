/**
 * Kök yerleşim: sağlayıcı zinciri ve Stack tanımı.
 * Ekranlar burada iş mantığı içermez; veri katmanına yalnızca hook'larla erişir.
 * Açılış (onboarding) kapısı ekran düzeyindedir: (tabs)/index.tsx.
 */
import { useEffect, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from '@/theme';
import { I18nProvider } from '@/i18n';
import { usePreferencesStore } from '@/store/preferences-store';

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

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {
      /* yoksay */
    });
  }, []);

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
