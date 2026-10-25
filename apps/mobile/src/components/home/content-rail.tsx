/**
 * Yatay içerik rayı — ana sayfa ve kategori sayfalarında liste bölümü.
 */
import { StyleSheet, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { SectionHeader } from '@/components/ui/section-header';
import { PosterCard } from '@/components/ui/poster-card';
import type { ContentSummary } from '@perdego/contracts';

export interface ContentRailProps {
  title: string;
  items: ContentSummary[];
  /** Kart genişliği; poster 120, dikey kart 156 önerilir. */
  itemWidth?: number;
  /** Dikey (9:16) kart mı, afiş (2:3) mi. */
  vertical?: boolean;
  onItemPress: (item: ContentSummary) => void;
  onSeeAll?: () => void;
  metaFor?: (item: ContentSummary) => string | undefined;
}

export function ContentRail({
  title,
  items,
  itemWidth = 120,
  vertical = false,
  onItemPress,
  onSeeAll,
  metaFor,
}: ContentRailProps) {
  if (items.length === 0) return null;

  return (
    <View>
      <SectionHeader title={title} actionLabel={onSeeAll ? 'Tümü' : undefined} onActionPress={onSeeAll} />
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.contentId}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => (
          <PosterCard
            title={item.title}
            metaText={metaFor?.(item)}
            aspect={vertical ? 'vertical' : 'poster'}
            imageUrl={vertical ? item.verticalPreviewUrl : item.posterUrl}
            accessType={item.accessType}
            isNew={item.isNew}
            width={itemWidth}
            onPress={() => onItemPress(item)}
          />
        )}
      />
    </View>
  );
}

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 16,
  },
  separator: {
    width: 12,
  },
});
