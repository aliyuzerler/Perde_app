/**
 * Şifre değiştirme ekranı (oturum açıkken). Sunucu diğer tüm cihazların
 * oturumunu kapatır; mevcut cihaz açık kalır.
 */
import { useState } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { AuthField } from '@/components/ui/auth-field';
import { useDescribeApiError, PASSWORD_POLICY_RE } from '@/utils/api-error';
import { spacing } from '@/theme/tokens';

export default function ChangePasswordScreen() {
  const { theme } = useTheme();
  const t = useT();
  const describeError = useDescribeApiError();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!current) {
      setError(t('auth.errorGeneric'));
      return;
    }
    if (next.length < 8 || !PASSWORD_POLICY_RE.test(next)) {
      setError(t('auth.passwordPolicy'));
      return;
    }
    if (next !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await contentApi.changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <AppText variant="display">{t('auth.changePasswordTitle')}</AppText>
        {done ? (
          <View style={styles.doneWrap}>
            <Ionicons name="shield-checkmark" size={56} color="#2e7d32" />
            <AppText variant="body" style={styles.center}>
              {t('auth.changePasswordSuccess')}
            </AppText>
          </View>
        ) : (
          <>
            <AuthField
              label={t('auth.currentPasswordLabel')}
              value={current}
              onChangeText={setCurrent}
              secureTextEntry
              secureToggle
            />
            <AuthField
              label={t('auth.newPasswordLabel')}
              value={next}
              onChangeText={setNext}
              secureTextEntry
              secureToggle
              placeholder={t('auth.passwordPolicy')}
            />
            <AuthField
              label={t('auth.newPasswordConfirmLabel')}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              secureToggle
            />
            {error ? (
              <AppText variant="caption" style={{ color: theme.colors.accent }} accessibilityLiveRegion="polite">
                {error}
              </AppText>
            ) : null}
            <AppButton
              label={t('auth.changePasswordCta')}
              onPress={() => void submit()}
              disabled={submitting}
            />
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing[4],
    paddingTop: spacing[5],
    gap: spacing[3],
  },
  doneWrap: {
    gap: spacing[3],
    alignItems: 'center',
    paddingVertical: spacing[5],
  },
  center: {
    textAlign: 'center',
  },
});
