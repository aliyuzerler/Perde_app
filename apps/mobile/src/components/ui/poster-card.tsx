/**
 * PerdeGo içerik kartı (Tasarım Zorunlulukları):
 * - DİKDÖRTGEN, köşe yarıçapı en fazla 4 px.
 * - Görsel alanı sabit en-boy oranında (poster 2:3 / dikey 9:16 / wide 16:9);
 *   afiş kesilmeden, orana zorlanmadan gösterilir.
 * - Kaynak görsel yoksa özgün placeholder çizilir.
 */
import { memo } from 'react';
import { Image } from 'expo-image';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppBadge } from './app-badge';
import { AppText } from './app-text';
import { GradientPlaceholder } from './gradient-placeholder';
import { useT } from '@/i18n';
import { useTheme } from '@/theme';
import { ASPECT_RATIOS, radius, spacing, type AspectRatioKey } from '@/theme/tokens';
import { getAccessVisual } from '@/utils/access';
import type { AccessType } from '@perdego/contracts';

export interface PosterCardProps {
  title: string;
  /** "2025 • Gerilim" gibi meta metni. */
  metaText?: string;
  aspect: AspectRatioKey;
  imageUrl?: string | null;
  accessType: AccessType;
  isNew?: boolean;
  width?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const PosterCard = memo(function PosterCard({
  title,
  metaText,
  aspect,
  imageUrl,
  accessType,
  isNew = false,
  width,
  onPress,
  style,
}: PosterCardProps) {
  const { theme } = useTheme();
  const t = useT();
  const access = getAccessVisual(accessType);
  const ratio = ASPECT_RATIOS[aspect];
  const aspectStyle: ViewStyle = { aspectRatio: ratio, width: width ?? '100%' };

  return (
    <View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${metaText ?? ''}`.trim()}
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface },
          aspectStyle,
        ]}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={imageUrl}
            accessible={false}
          />
        ) : (
          <GradientPlaceholder seed={title} title={title} />
        )}

        {/* Alt karartma gradyanı — metin okunabilirliği */}
        <View style={[StyleSheet.absoluteFill, styles.bottomScrim]} pointerEvents="none" />

        {/* Rozetler */}
        <View style={styles.badgeRow} pointerEvents="none">
          {isNew ? <AppBadge label={t('content.newBadge')} tone="accent" /> : <View />}
          {access.showBadge ? (
            <AppBadge label={t(`access.${access.labelKey}`)} tone="neutral" />
          ) : null}
        </View>

        {/* Başlık bloğu */}
        <View style={styles.titleWrap} pointerEvents="none">
          <AppText variant="heading" numberOfLines={2} style={styles.title}>
            {title}
          </AppText>
          {metaText ? (
            <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.meta}>
              {metaText}
            </AppText>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245, 241, 234, 0.08)',
  },
  bottomScrim: {
    backgroundColor: 'rgba(13, 13, 15, 0.35)',
    opacity: 0.9,
  },
  badgeRow: {
    position: 'absolute',
    top: spacing[2],
    left: spacing[2],
    right: spacing[2],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleWrap: {
    position: 'absolute',
    left: spacing[3],
    right: spacing[3],
    bottom: spacing[3],
  },
  title: {
    textShadowColor: 'rgba(13, 13, 15, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  meta: {
    marginTop: 2,
  },
});
