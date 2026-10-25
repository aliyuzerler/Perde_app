/**
 * Form alanı — giriş/kayıt ekranları için etiketli metin girişi.
 * Hata metni i18n'den gelir; alanın kendisi doğrulamayı dışarıya bırakır.
 * `secureToggle` ile parola göster/gizle düğmesi etkinleşir (Faz 3b kuralı).
 */
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { AppText } from '@/components/ui/app-text';
import { radius, spacing } from '@/theme/tokens';

export interface AuthFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  /** secureTextEntry ile birlikte: göz düğmesi (göster/gizle). */
  secureToggle?: boolean;
}

export function AuthField({
  label,
  error,
  style,
  secureTextEntry,
  secureToggle = false,
  ...inputProps
}: AuthFieldProps) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(!secureTextEntry);
  const isSecure = Boolean(secureTextEntry) && !visible;

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
          secureTextEntry={isSecure}
          placeholderTextColor={theme.colors.textSubtle}
          style={[styles.input, { color: theme.colors.text }, style]}
        />
        {secureTextEntry && secureToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Şifreyi gizle' : 'Şifreyi göster'}
            accessibilityState={{ selected: visible }}
            onPress={() => setVisible((v) => !v)}
            style={styles.toggle}
            hitSlop={8}
          >
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.colors.textSubtle}
            />
          </Pressable>
        ) : null}
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
    flex: 1,
    fontSize: 15,
    paddingVertical: 12,
  },
  toggle: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
