/**
 * Fiyat kartı — abonelik planları ve kredi paketleri için ortak yüzey.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';
import { AppText } from '@/components/ui/app-text';
import { AppBadge } from '@/components/ui/app-badge';
import { radius, spacing } from '@/theme/tokens';

export interface PriceCardProps {
  title: string;
  priceText: string;
  /** Plan altında "aylık ₺33,33" gibi yardımcı satır. */
  subText?: string;
  badges?: { label: string; tone?: 'accent' | 'neutral' | 'outline' }[];
  bullets?: string[];
  selected?: boolean;
  onPress?: () => void;
}

export function PriceCard({
  title,
  priceText,
  subText,
  badges,
  bullets,
  selected,
  onPress,
}: PriceCardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        selected && { borderColor: theme.colors.accent },
      ]}
    >
      {badges && badges.length > 0 ? (
        <View style={styles.badges}>
          {badges.map((badge) => (
            <AppBadge key={badge.label} label={badge.label} tone={badge.tone ?? 'outline'} />
          ))}
        </View>
      ) : null}
      <View style={styles.headerRow}>
        <AppText variant="heading">{title}</AppText>
        <AppText variant="title" style={{ color: theme.colors.accent }}>
          {priceText}
        </AppText>
      </View>
      {subText ? (
        <AppText variant="caption" color="textSubtle">
          {subText}
        </AppText>
      ) : null}
      {bullets && bullets.length > 0 ? (
        <View style={styles.bullets}>
          {bullets.map((bullet) => (
            <View key={bullet} style={styles.bulletRow}>
              <View style={[styles.bulletDot, { backgroundColor: theme.colors.accent }]} />
              <AppText variant="body" color="textMuted">
                {bullet}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing[4],
    gap: spacing[2],
  },
  badges: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  bullets: {
    gap: spacing[2],
    marginTop: spacing[1],
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: radius.none,
    marginTop: 9,
  },
});
