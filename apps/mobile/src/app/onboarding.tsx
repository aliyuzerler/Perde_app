/**
 * Açılış (onboarding) ekranı — bir kez gösterilir.
 * Marka girişi + değer önerisi + misafir girişi. Kayıt zorunlu DEĞİLDİR;
 * kullanıcı misafir olarak tüm ücretsiz içeriği izleyebilir.
 */
import { StyleSheet, View, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { usePreferencesStore } from '@/store/preferences-store';
import { colors as palette } from '@/theme/tokens';

export default function OnboardingScreen() {
  const { theme } = useTheme();
  const t = useT();
  const setHasSeenOnboarding = usePreferencesStore(
    (state) => state.setHasSeenOnboarding
  );

  const enter = () => {
    setHasSeenOnboarding(true);
    router.replace('/(tabs)');
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <LinearGradient
        pointerEvents="none"
        colors={[palette.bg, 'rgba(183, 28, 54, 0.12)', palette.bg]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.brandBlock}>
        <View style={styles.brandBar} />
        <AppText variant="display" style={styles.brandName}>
          {t('common.appName')}
        </AppText>
        <AppText variant="heading" color="textMuted" style={styles.tagline}>
          {t('onboarding.tagline')}
        </AppText>
      </View>

      <View style={styles.bullets}>
        {(['bullet1', 'bullet2', 'bullet3'] as const).map((key) => (
          <View key={key} style={styles.bulletRow}>
            <View style={[styles.bulletDot, { backgroundColor: theme.colors.accent }]} />
            <AppText variant="body" color="textMuted">
              {t(`onboarding.${key}` as 'onboarding.bullet1')}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <AppButton label={t('onboarding.start')} onPress={enter} />
        <View style={styles.guestWrap}>
          <Pressable
            accessibilityRole="button"
            onPress={enter}
            style={styles.guestButton}
          >
            <AppText variant="body" color="textMuted">
              {t('onboarding.guest')}
            </AppText>
          </Pressable>
        </View>
        <AppText variant="caption" color="textSubtle" style={styles.notice}>
          {t('onboarding.mockNotice')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 96,
    paddingBottom: 40,
  },
  brandBlock: {
    gap: 12,
  },
  brandBar: {
    width: 56,
    height: 6,
    backgroundColor: palette.accent,
    borderRadius: 0,
  },
  brandName: {
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: 1,
  },
  tagline: {
    maxWidth: 280,
  },
  bullets: {
    gap: 14,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bulletDot: {
    width: 4,
    height: 4,
    marginTop: 9,
  },
  actions: {
    gap: 12,
  },
  guestWrap: {
    alignItems: 'center',
  },
  guestButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  notice: {
    textAlign: 'center',
  },
});
