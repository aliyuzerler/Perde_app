/**
 * Profil düzenleme ekranı — görünen ad değiştirme. Avatar yükleme UI'ı
 * image-picker Faz sonrası işaretlendi (sunucu altyapısı /me/avatar hazır);
 * kural: sahte başarılı davranış gösterilmez.
 */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { AuthField } from '@/components/ui/auth-field';
import { useAuthStore } from '@/store/auth-store';
import { useDescribeApiError } from '@/utils/api-error';

export default function EditProfileScreen() {
  const t = useT();
  const describeError = useDescribeApiError();
  const styles = getStyles();
  const updateUser = useAuthStore((state) => state.updateUser);
  const session = useAuthStore((state) => state.session);
  const params = useLocalSearchParams<{ saved?: string }>();

  const [displayName, setDisplayName] = useState(session?.user.displayName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(params.saved === '1');

  const save = async () => {
    if (displayName.trim().length < 2) {
      setError(t('auth.shortName'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const profile = await contentApi.updateProfile({ displayName: displayName.trim() });
      updateUser({ displayName: profile.displayName });
      setSaved(true);
      router.back();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <AppText variant="display">{t('auth.editProfileTitle')}</AppText>
        <AuthField
          label={t('auth.displayNameLabel')}
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          error={error}
        />
        {saved && !error ? (
          <View style={styles.savedRow} accessibilityLiveRegion="polite">
            <Ionicons name="checkmark-circle" size={16} color="#2e7d32" />
            <AppText variant="caption">{t('auth.profileSaved')}</AppText>
          </View>
        ) : null}
        <AppButton label={t('auth.saveProfile')} onPress={() => void save()} disabled={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}

const getStyles = () => ({
  body: {
    padding: 16,
    paddingTop: 24,
    gap: 12,
  },
  savedRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
});
