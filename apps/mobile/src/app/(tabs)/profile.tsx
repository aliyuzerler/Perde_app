/**
 * Profil ve hesap ayarları (Faz 3b: gerçek oturum + hesap güvenliği).
 *
 * - Misafir: giriş/kayıt çağrıları + yasal metin erişimi (farklı deneyim).
 * - Üye: e-posta (maskeli) + doğrulama rozeti, profil düzenleme, şifre
 *   değiştirme, etkin oturumlar, hesap silme ve çıkış.
 * - Cüzdan/abonelik durumu: mock adapter üzerinden özet görünüm (Faz 5'e kadar).
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
  const clearSession = useAuthStore((state) => state.clearSession);
  const autoplay = usePreferencesStore((state) => state.autoplayPreviews);
  const setAutoplay = usePreferencesStore((state) => state.setAutoplayPreviews);
  const dataSaver = usePreferencesStore((state) => state.dataSaver);
  const setDataSaver = usePreferencesStore((state) => state.setDataSaver);
  const locale = usePreferencesStore((state) => state.locale);
  const setLocale = usePreferencesStore((state) => state.setLocale);

  const wallet = useQuery({
    queryKey: queryKeys.wallet,
    queryFn: () => contentApi.getWallet(),
    // Gerçek cüzdan uçları Faz 5'te devreye girer; hatayı sessiz gösteririz.
    retry: false,
  });

  const walletSummary = wallet.data ? `${wallet.data.wallet.creditBalance} kredi` : '—';

  const signOut = () => {
    void contentApi
      .logout()
      .catch(() => undefined)
      .finally(() => clearSession());
  };

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
            {session?.user.displayName ? (
              <GradientPlaceholder
                seed={session.user.displayName}
                title={session.user.displayName.slice(0, 1).toUpperCase()}
                style={styles.avatar}
              />
            ) : (
              <GradientPlaceholder seed="perdego-guest" title="P" style={styles.avatar} />
            )}
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
                <View style={styles.badgeRow}>
                  <AppBadge
                    label={
                      session.user.emailVerified
                        ? t('auth.emailVerifiedBadge')
                        : t('auth.emailUnverifiedBadge')
                    }
                    tone={session.user.emailVerified ? 'accent' : 'outline'}
                  />
                  <AppText variant="caption" color="textSubtle">
                    {t('profile.memberSince')}: {formatMonthYear(session.user.joinedAt)}
                  </AppText>
                </View>
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
              onPress={signOut}
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
                wallet.data ? SUBSCRIPTION_LABEL[wallet.data.wallet.subscriptionStatus] : '—'
              }
              onPress={() => router.push('/paywall')}
            />
          </View>
        </View>

        {/* Hesap güvenliği (yalnızca oturum açıkken — misafir farklı deneyim) */}
        {session ? (
          <View style={styles.section}>
            <AppText variant="heading">{t('auth.accountSection')}</AppText>
            <View style={styles.settingGroup}>
              <SettingRow
                label={t('auth.editProfile')}
                onPress={() => router.push('/account/edit-profile')}
              />
              <SettingRow
                label={t('auth.changePassword')}
                onPress={() => router.push('/account/change-password')}
              />
              <SettingRow
                label={t('auth.activeSessions')}
                onPress={() => router.push('/account/sessions')}
              />
              <SettingRow
                label={t('auth.deleteAccount')}
                onPress={() => router.push('/account/delete-account')}
              />
            </View>
          </View>
        ) : null}

        {/* Yasal metinler — misafir dahil herkese açık (kural) */}
        <View style={styles.section}>
          <AppText variant="heading">{t('auth.legalTitle')}</AppText>
          <View style={styles.settingGroup}>
            <SettingRow
              label={t('auth.legalTerms')}
              onPress={() => router.push('/legal/terms')}
            />
            <SettingRow
              label={t('auth.legalPrivacy')}
              onPress={() => router.push('/legal/privacy')}
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
              onPress={() => setLocale(locale === 'tr' ? 'en' : 'tr')}
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
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      marginTop: 2,
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
