/**
 * Öne çıkan yapım (hero) — ana sayfa sinematik açılış alanı.
 * Kesinlikle dikdörtgen (radius.md = 4px); yuvarlak kart yok (Tasarım Kuralları).
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useT } from '@/i18n';
import { AppText } from '@/components/ui/app-text';
import { AppBadge } from '@/components/ui/app-badge';
import { AppButton } from '@/components/ui/app-button';
import { GradientPlaceholder } from '@/components/ui/gradient-placeholder';
import { colors as palette } from '@/theme/tokens';
import { getAccessVisual } from '@/utils/access';
import type { ContentSummary } from '@perdego/contracts';

export interface HeroBannerProps {
  item: ContentSummary;
  tagline?: string;
  episodeCount?: number;
  seasonCount?: number;
  onPlay: () => void;
  onDetail: () => void;
}

export function HeroBanner({
  item,
  tagline,
  episodeCount,
  seasonCount,
  onPlay,
  onDetail,
}: HeroBannerProps) {
  const t = useT();
  const access = getAccessVisual(item.accessType);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onDetail}
      style={styles.wrap}
    >
      <View style={styles.media}>
        <GradientPlaceholder seed={item.title} title={item.title} />
        <LinearGradient
          pointerEvents="none"
          colors={[palette.overlay, 'transparent', palette.bg]}
          style={styles.scrim}
        />
        <View style={styles.badges}>
          {item.isNew ? <AppBadge label={t('content.newBadge')} tone="accent" /> : null}
          {access.showBadge ? (
            <AppBadge
              label={t(`access.${access.labelKey}` as 'access.FREE')}
              tone="outline"
            />
          ) : null}
        </View>
      </View>

      <View style={styles.body}>
        <AppText variant="display" style={styles.title}>
          {item.title}
        </AppText>
        {tagline ? (
          <AppText variant="body" color="textMuted" style={styles.tagline}>
            {tagline}
          </AppText>
        ) : null}
        <AppText variant="caption" color="textSubtle">
          {heroMetaLine(item.releaseYear, item.genres, episodeCount, seasonCount)}
        </AppText>
        <View style={styles.actions}>
          <View style={styles.action}>
            <AppButton label={t('home.playHero')} onPress={onPlay} />
          </View>
          <View style={styles.action}>
            <AppButton
              label={t('home.detailCta')}
              variant="secondary"
              onPress={onDetail}
            />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function heroMetaLine(
  releaseYear: number,
  genres: string[],
  episodeCount?: number,
  seasonCount?: number
): string {
  const parts = [String(releaseYear)];
  if (seasonCount && seasonCount > 0) {
    parts.push(`${seasonCount} Sezon`);
  } else if (episodeCount && episodeCount > 0) {
    parts.push(`${episodeCount} Bölüm`);
  }
  if (genres.length > 0) {
    parts.push(genres.slice(0, 2).map((genre) => genre.replace(/-/g, ' ')).join(', '));
  }
  return parts.join(' • ');
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 4,
    overflow: 'hidden',
  },
  media: {
    aspectRatio: 16 / 9,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  scrim: {
    position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
  },
  badges: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  body: {
    paddingHorizontal: 4,
    paddingTop: 12,
    gap: 4,
  },
  title: {},
  tagline: {
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  action: {
    flex: 1,
  },
});
