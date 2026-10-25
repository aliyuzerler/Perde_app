/**
 * Profil: geliştirme profili + tercihler.
 * Oturum akışları Faz 3'te eklenecektir; ekran bunu dürüstçe belirtir.
 */
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppBadge } from '@/components/ui/app-badge';
import { GradientPlaceholder } from '@/components/ui/gradient-placeholder';
import { useDevProfile } from '@/hooks/use-dev-profile';
import { usePreferencesStore } from '@/store/preferences-store';
import { radius, spacing, layout } from '@/theme/tokens';
import { formatMonthYear } from '@/utils/format';
import type { SupportedLocale } from '@perdego/contracts';

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  tr: 'Türkçe',
  en: 'English',
};

export default function ProfileScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);

  const profile = useDevProfile();
  const autoplay = usePreferencesStore((state) => state.autoplayPreviews);
  const setAutoplay = usePreferencesStore((state) => state.setAutoplayPreviews);
  const dataSaver = usePreferencesStore((state) => state.dataSaver);
  const setDataSaver = usePreferencesStore((state) => state.setDataSaver);
  const locale = usePreferencesStore((state) => state.locale);
  const setLocale = usePreferencesStore((state) => state.setLocale);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText variant="title">{t('profile.title')}</AppText>
        {__DEV__ ? (
          <View style={styles.devNotice}>
            <AppBadge label={t('profile.devDataNotice')} tone="outline" />
          </View>
        ) : null}
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatarWrap}>
          {profile?.avatarUrl ? null : (
            <GradientPlaceholder
              seed={profile?.displayName ?? 'perdego-guest'}
              title={profile?.displayName ?? 'P'}
              style={styles.avatar}
            />
          )}
        </View>
        <View style={styles.profileTexts}>
          <AppText variant="heading">{profile?.displayName ?? t('profile.guest')}</AppText>
          {profile?.maskedEmail ? (
            <AppText variant="caption" color="textMuted">
              {profile.maskedEmail}
            </AppText>
          ) : null}
          {profile ? (
            <AppText variant="caption" color="textSubtle">
              {t('profile.memberSince')}: {formatMonthYear(profile.joinedAt)}
            </AppText>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="heading">{t('profile.preferencesTitle')}</AppText>

        <View style={styles.prefRow}>
          <View style={styles.prefTexts}>
            <AppText variant="body">{t('profile.autoplayPreviews')}</AppText>
            <AppText variant="caption" color="textSubtle">
              {t('profile.autoplayPreviewsHint')}
            </AppText>
          </View>
          <Switch
            value={autoplay}
            onValueChange={setAutoplay}
            trackColor={{ true: theme.colors.accent, false: theme.colors.surfaceElevated }}
            thumbColor={theme.colors.text}
            accessibilityLabel={t('profile.autoplayPreviews')}
          />
        </View>

        <View style={styles.prefRow}>
          <View style={styles.prefTexts}>
            <AppText variant="body">{t('profile.dataSaver')}</AppText>
            <AppText variant="caption" color="textSubtle">
              {t('profile.dataSaverHint')}
            </AppText>
          </View>
          <Switch
            value={dataSaver}
            onValueChange={setDataSaver}
            trackColor={{ true: theme.colors.accent, false: theme.colors.surfaceElevated }}
            thumbColor={theme.colors.text}
            accessibilityLabel={t('profile.dataSaver')}
          />
        </View>

        <View style={styles.prefRow}>
          <View style={styles.prefTexts}>
            <AppText variant="body">{t('profile.language')}</AppText>
          </View>
          <View style={styles.localeRow}>
            {(Object.keys(LOCALE_LABELS) as SupportedLocale[]).map((code) => {
              const active = locale === code;
              return (
                <Pressable
                  key={code}
                  style={[styles.localeChip, active && styles.localeChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={LOCALE_LABELS[code]}
                  onPress={() => setLocale(code)}
                >
                  <AppText
                    variant="label"
                    style={active ? undefined : { color: theme.colors.textMuted }}
                  >
                    {LOCALE_LABELS[code]}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
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
    devNotice: {
      marginRight: 0,
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
    section: {
      paddingHorizontal: spacing[4],
      gap: spacing[4],
    },
    prefRow: {
      gap: spacing[2],
    },
    prefTexts: {
      flex: 1,
      gap: 2,
    },
    localeRow: {
      flexDirection: 'row',
      gap: spacing[2],
      marginTop: spacing[1],
    },
    localeChip: {
      minHeight: layout.minTouchTarget,
      paddingHorizontal: spacing[3],
      paddingVertical: 6,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    localeChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
  });
