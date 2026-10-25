/**
 * Standart metin bileşeni — tipografi ölçeğinin tek kaynağı.
 * Bileşenlerde doğrudan fontSize kullanılmaz; varyant seçilir.
 */
import { memo } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';
import { useTheme } from '@/theme';
import {
  typography,
  type AppColor,
  type TypographyVariant,
} from '@/theme/tokens';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: AppColor;
  /** Dizideki meta ayırıcıları vb. için kullanılır. */
  numberOfLines?: number;
}

export const AppText = memo(function AppText({
  variant = 'body',
  color = 'text',
  style,
  ...rest
}: AppTextProps) {
  const { theme } = useTheme();
  const preset = typography[variant];
  return (
    <Text
      style={[
        preset,
        { color: theme.colors[color] },
        style,
      ]}
      maxFontSizeMultiplier={1.3}
      {...rest}
    />
  );
});

export const styles = StyleSheet.create({});
