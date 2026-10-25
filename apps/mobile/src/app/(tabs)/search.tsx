/**
 * Ara: gecikmeli (debounced) arama girişi + sonuç listesi.
 * Tüm durumlar tasarlanmıştır: boş (idle), yükleniyor, sonuçsuz, hata.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  FlatList,
  StyleSheet,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useSearch } from '@/hooks/queries/use-search';
import { ScreenContainer } from '@/components/screen-container';
import { PosterCard } from '@/components/ui/poster-card';
import { AppText } from '@/components/ui/app-text';
import { LoadingView } from '@/components/state-views/loading-view';
import { EmptyView } from '@/components/state-views/empty-view';
import { ErrorView } from '@/components/state-views/error-view';
import { ApiClientError } from '@/services/api-client';
import { radius, spacing } from '@/theme/tokens';
import type { ContentSummary } from '@perdego/contracts';

const DEBOUNCE_MS = 300;

export default function SearchScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);

  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(input.trim());
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const search = useSearch({ query: debounced, page });

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ContentSummary>) => <SearchResultRow item={item} />,
    []
  );

  const body = useMemo(() => {
    if (debounced.trim().length === 0) {
      return (
        <EmptyView
          title={t('search.idleTitle')}
          body={t('search.idleBody')}
          icon="search-outline"
          style={styles.centered}
        />
      );
    }
    if (search.isPending) {
      return <LoadingView variant="list" style={styles.centered} />;
    }
    if (search.isError) {
      const isNetwork =
        search.error instanceof ApiClientError && search.error.isNetworkFailure;
      return (
        <ErrorView
          kind={isNetwork ? 'network' : 'generic'}
          title={t('error.networkTitle')}
          body={t('error.networkBody')}
          onRetry={() => search.refetch()}
          style={styles.centered}
        />
      );
    }
    const items = search.data?.items ?? [];
    if (items.length === 0) {
      return (
        <EmptyView
          title={t('search.noResultsTitle')}
          body={t('search.noResultsBody', { query: debounced })}
          icon="albums-outline"
          style={styles.centered}
        />
      );
    }
    return (
      <FlatList
        data={items}
        keyExtractor={(item: ContentSummary) => item.contentId}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.resultList}
        onEndReached={() => {
          const meta = search.data?.meta;
          if (meta?.hasNextPage) {
            setPage((current) => current + 1);
          }
        }}
        onEndReachedThreshold={0.4}
      />
    );
  }, [debounced, search, t, styles.centered, styles.resultList, renderItem]);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText variant="title">{t('search.title')}</AppText>
        <View style={styles.inputWrap}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('search.placeholder')}
            placeholderTextColor={theme.colors.textSubtle}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t('search.title')}
          />
        </View>
      </View>
      {body}
    </ScreenContainer>
  );
}

/** Tek arama sonucu satırı. */
function SearchResultRow({ item }: { item: ContentSummary }) {
  return (
    <View style={resultRowStyle.row}>
      <PosterCard
        title={item.title}
        metaText={[String(item.releaseYear), item.genres[0]?.replace(/-/g, ' ')]
          .filter(Boolean)
          .join(' • ')}
        aspect="poster"
        imageUrl={item.posterUrl ?? null}
        accessType={item.accessType}
        isNew={item.isNew}
        width={84}
        onPress={() => router.push({ pathname: '/content/[id]', params: { id: item.contentId } })}
      />
      <View style={resultRowStyle.texts}>
        <AppText variant="heading" numberOfLines={1}>
          {item.title}
        </AppText>
        <AppText variant="caption" color="textMuted" numberOfLines={2}>
          {[String(item.releaseYear), item.genres.map((g) => g.replace(/-/g, ' ')).join(', ')]
            .filter(Boolean)
            .join(' • ')}
        </AppText>
      </View>
    </View>
  );
}

const resultRowStyle = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing[3],
    alignItems: 'stretch',
  },
  texts: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
});

const getStyles = (colors: ReturnType<typeof useTheme>['theme']['colors']) =>
  StyleSheet.create({
    header: {
      paddingHorizontal: spacing[4],
      paddingTop: spacing[3],
      gap: spacing[3],
    },
    inputWrap: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing[3],
      minHeight: 44,
      justifyContent: 'center',
    },
    input: {
      color: colors.text,
      fontSize: 15,
      paddingVertical: 10,
    },
    resultList: {
      paddingHorizontal: spacing[4],
      paddingTop: spacing[4],
      gap: spacing[3],
      paddingBottom: spacing[6],
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
    },
  });
