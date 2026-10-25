/**
 * Profil ve hesap ayarları.
 * Oturum: auth-store (Faz 3 mock; gerçek kimlik Faz 3 sunucu fazında).
 * Cüzdan/abonelik durumu: mock adapter üzerinden özet görünüm.
 */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppBadge } from '@/components/ui/app-badge';
import { AppButton } from '@/components/ui/app-button';
import { SettingRow } from '@/components/ui/setting-row';
import { GradientPlaceholder } from '@/components/ui/gradient-placeholder';
import { queryKeys } from '@/hooks/queries/query-keys';
import { useAuthStore } from '@/store/auth-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { radius, spacing, layout } from '@/theme/tokens';
import { formatMonthYear } from '@/utils/format';
import type { SupportedLocale } from '@perdego/contracts';

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  tr: 'Türkçe',
  en: 'English',
};

const SUBSCRIPTION_LABEL: Record<string, string> = {
  NONE: '—',
  TRIALING: 'Deneme',
  ACTIVE: 'Etkin',
  EXPIRED: 'Süresi bitti',
};

export default function ProfileScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);

  const session = useAuthStore((state) => state.session);
  const setSession = useAuthStore((state) => state.setSession);
  const autoplay = usePreferencesStore((state) => state.autoplayPreviews);
  const setAutoplay = usePreferencesStore((state) => state.setAutoplayPreviews);
  const dataSaver = usePreferencesStore((state) => state.dataSaver);
  const setDataSaver = usePreferencesStore((state) => state.setDataSaver);
  const locale = usePreferencesStore((state) => state.locale);
  const setLocale = usePreferencesStore((state) => state.setLocale);

  const wallet = useQuery({
    queryKey: queryKeys.wallet,
    queryFn: () => contentApi.getWallet(),
  });

  const walletSummary = wallet.data
    ? `${wallet.data.wallet.creditBalance} kredi`
    : '—';

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AppText variant="title">{t('profile.title')}</AppText>
          {__DEV__ ? <AppBadge label={t('profile.devDataNotice')} tone="outline" /> : null}
        </View>

        {/* Kullanıcı kartı */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <GradientPlaceholder
              seed={session?.user.displayName ?? 'perdego-guest'}
              title={session?.user.displayName ?? 'P'}
              style={styles.avatar}
            />
          </View>
          <View style={styles.profileTexts}>
            <AppText variant="heading">
              {session?.user.displayName ?? t('profile.guest')}
            </AppText>
            {session ? (
              <>
                <AppText variant="caption" color="textMuted">
                  {session.user.email}
                </AppText>
                <AppText variant="caption" color="textSubtle">
                  {t('profile.memberSince')}: {formatMonthYear(session.user.joinedAt)}
                </AppText>
              </>
            ) : (
              <AppText variant="caption" color="textSubtle">
                {t('auth.guestCta')}
              </AppText>
            )}
          </View>
        </View>

        {!session ? (
          <View style={styles.authActions}>
            <AppButton label={t('auth.loginCta')} onPress={() => router.push('/auth/login')} />
            <AppButton
              label={t('auth.registerCta')}
              variant="secondary"
              onPress={() => router.push('/auth/register')}
            />
          </View>
        ) : (
          <View style={styles.signOutWrap}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void contentApi.logout().finally(() => setSession(null));
              }}
              style={styles.signOutButton}
            >
              <Ionicons name="log-out-outline" size={18} color={theme.colors.accent} />
              <AppText variant="body" style={{ color: theme.colors.accent }}>
                {t('profile.signOut')}
              </AppText>
            </Pressable>
          </View>
        )}

        {/* Hesap bölümü */}
        <View style={styles.section}>
          <AppText variant="heading">{t('profile.sectionAccount')}</AppText>
          <View style={styles.settingGroup}>
            <SettingRow
              label={t('credits.title')}
              value={walletSummary}
              onPress={() => router.push('/credits')}
            />
            <SettingRow
              label={t('profile.subscription')}
              value={
                wallet.data
                  ? SUBSCRIPTION_LABEL[wallet.data.wallet.subscriptionStatus]
                  : '—'
              }
              onPress={() => router.push('/paywall')}
            />
          </View>
        </View>

        {/* Tercihler */}
        <View style={styles.section}>
          <AppText variant="heading">{t('profile.preferencesTitle')}</AppText>
          <View style={styles.settingGroup}>
            <SettingRow
              label={t('profile.autoplayPreviews')}
              hint={t('profile.autoplayPreviewsHint')}
              switchValue={autoplay}
              onSwitchChange={setAutoplay}
            />
            <SettingRow
              label={t('profile.dataSaver')}
              hint={t('profile.dataSaverHint')}
              switchValue={dataSaver}
              onSwitchChange={setDataSaver}
            />
            <SettingRow
              label={t('profile.language')}
              value={LOCALE_LABELS[locale]}
              onPress={() =>
                setLocale(locale === 'tr' ? 'en' : 'tr')
              }
            />
          </View>
        </View>

        <AppText variant="caption" color="textSubtle" style={styles.footerNote}>
          {t('auth.mockNotice')} • pnpm monorepo · apps/mobile
        </AppText>
      </ScrollView>
    </ScreenContainer>
  );
}

const getStyles = (colors: ReturnType<typeof useTheme>['theme']['colors']) =>
  StyleSheet.create({
    header: {
      paddingHorizontal: spacing[4],
      paddingTop: spacing[3],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    profileCard: {
      margin: spacing[4],
      padding: spacing[4],
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      flexDirection: 'row',
      gap: spacing[3],
      alignItems: 'center',
    },
    avatarWrap: {
      width: 64,
      height: 64,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    avatar: {
      flex: 1,
    },
    profileTexts: {
      flex: 1,
      gap: 2,
    },
    authActions: {
      paddingHorizontal: spacing[4],
      gap: spacing[2],
    },
    signOutWrap: {
      paddingHorizontal: spacing[4],
      marginBottom: spacing[2],
    },
    signOutButton: {
      minHeight: layout.minTouchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
    },
    section: {
      paddingHorizontal: spacing[4],
      gap: spacing[3],
      marginBottom: spacing[4],
    },
    settingGroup: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing[3],
    },
    footerNote: {
      textAlign: 'center',
      paddingBottom: spacing[5],
    },
  });
