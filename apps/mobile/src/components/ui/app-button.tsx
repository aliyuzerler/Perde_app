/**
 * Dikdörtgen buton — hap (pill) formu YASAKTIR (docs/DESIGN.md §2).
 * Minimum dokunma hedefi 44 px (erişilebilirlik).
 */
import { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { AppText } from './app-text';
import { useTheme } from '@/theme';
import { layout, radius, spacing } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Satır ikonu (Ionicons adı). */
  icon?: string;
  style?: ViewStyle;
}

export const AppButton = memo(function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: AppButtonProps) {
  const { theme } = useTheme();

  const containerStyle = (pressed: boolean): ViewStyle[] => {
    const base: ViewStyle[] = [
      styles.container,
      { minHeight: layout.minTouchTarget },
    ];
    if (variant === 'primary') {
      base.push({
        backgroundColor: disabled || pressed ? theme.colors.accentSoft : theme.colors.accent,
      });
      base.push(styles.primaryLabel);
    } else if (variant === 'secondary') {
      base.push({
        backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
      });
    } else {
      base.push({ backgroundColor: 'transparent' });
    }
    return base;
  };

  const textColor =
    variant === 'primary' ? theme.colors.text : theme.colors.textMuted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [containerStyle(pressed), style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <AppText variant="label" style={{ color: textColor, letterSpacing: 0.6 }}>
          {label.toLocaleUpperCase('tr-TR')}
        </AppText>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {},
});
