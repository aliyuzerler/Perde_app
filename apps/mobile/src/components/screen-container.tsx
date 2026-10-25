/** Ortak ekran kapsayıcısı: güvenli alan + zemin rengi. */
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

export interface ScreenContainerProps {
  children: React.ReactNode;
  /** Ekstra kenar boşluğu stilleri. */
  style?: ViewStyle;
  /** Üst güvenli alanı yoksay (hero tam kenar olan ekranlar için). */
  ignoreTopInset?: boolean;
}

export function ScreenContainer({
  children,
  style,
  ignoreTopInset = false,
}: ScreenContainerProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.bg,
          paddingTop: ignoreTopInset ? 0 : insets.top,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
