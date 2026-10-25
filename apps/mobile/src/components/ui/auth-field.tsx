/**
 * Form alanı — giriş/kayıt ekranları için etiketli metin girişi.
 * Hata metni i18n'den gelir; alanın kendisi doğrulamayı dışarıya bırakır.
 */
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme';
import { AppText } from '@/components/ui/app-text';
import { radius, spacing } from '@/theme/tokens';

export interface AuthFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
}

export function AuthField({ label, error, style, ...inputProps }: AuthFieldProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.wrap}>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      <View
        style={[
          styles.inputWrap,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          error ? { borderColor: theme.colors.accent } : null,
        ]}
      >
        <TextInput
          {...inputProps}
          placeholderTextColor={theme.colors.textSubtle}
          style={[styles.input, { color: theme.colors.text }, style]}
        />
      </View>
      {error ? (
        <AppText variant="caption" style={{ color: theme.colors.accent }} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  inputWrap: {
    borderRadius: radius.sm,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  input: {
    fontSize: 15,
    paddingVertical: 12,
  },
});
