/**
 * Özgün görsel placeholder'ı.
 * Kaynak afiş yoksa: deterministik sinematik gradyan + baş harf monogramı.
 * Telifli afiş KULLANILMAZ (Tasarım Zorunlulukları).
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from './app-text';
import { getMonogram, getPlaceholderStyle } from '@/theme/placeholder';

export interface GradientPlaceholderProps {
  seed: string;
  title: string;
  style?: object;
}

export const GradientPlaceholder = memo(function GradientPlaceholder({
  seed,
  title,
  style,
}: GradientPlaceholderProps) {
  const style_ = getPlaceholderStyle(seed);
  return (
    <View style={[StyleSheet.absoluteFill, style]} accessibilityElementsHidden>
      <LinearGradient
        colors={style_.gradientColors}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.tint,
          { backgroundColor: style_.accentTint },
        ]}
      />
      <View style={styles.monogramWrap} pointerEvents="none">
        <AppText variant="display" style={{ color: style_.monogramColor }}>
          {getMonogram(title)}
        </AppText>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  tint: {},
  monogramWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
