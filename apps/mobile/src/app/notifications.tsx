/**
 * Bildirim merkezi ekranı (FAZ 9) — uygulama içi bildirimler.
 *
 * - Okunmamışlar vurgulu; tek bildirime dokunma → derin bağlantı + okundu.
 * - "Tümünü okundu işaretle" toplu aksiyonu.
 * - Sayfalama: "Daha fazla" (meta.totalPages).
 */
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { queryKeys } from '@/hooks/queries/query-keys';
import { useDescribeApiError } from '@/utils/api-error';
import { radius, spacing } from '@/theme/tokens';
import { resolveNotificationRoute } from '@/services/notifications/deep-link';
import type { Theme } from '@/theme';
import type { NotificationItem } from '@perdego/contracts';

const PAGE_SIZE = 20;

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const queryClient = useQueryClient();
  const describeError = useDescribeApiError();
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const notifications = useQuery({
    queryKey: queryKeys.notifications(page),
    queryFn: () => contentApi.listNotifications({ page, pageSize: PAGE_SIZE }),
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [queryClient]);

  const markAllRead = useCallback(async () => {
    setError(null);
    try {
      await contentApi.markAllNotificationsRead();
      invalidate();
    } catch (err) {
      setError(describeError(err));
    }
  }, [describeError, invalidate]);

  const openItem = useCallback(
    async (item: NotificationItem) => {
      setError(null);
      const route = resolveNotificationRoute(item.data as Record<string, unknown> | undefined);
      if (!item.readAt) {
        try {
          await contentApi.markNotificationRead(item.id);
          invalidate();
        } catch {
          // Okundu işareti başarısızsa gezinme engellenmez.
        }
      }
      if (route) router.push(route.path);
    },
    [invalidate],
  );

  if (notifications.isLoading && page === 1) {
    return <LoadingView variant="list" />;
  }
  if (notifications.isError) {
    return <ErrorView title={t('notifications.loadError')} retryLabel={t('common.retry')} onRetry={() => void notifications.refetch()} />;
  }

  const items = notifications.data?.items ?? [];
  const unreadCount = notifications.data?.unreadCount ?? 0;
  const totalPages = notifications.data?.meta?.totalPages ?? 1;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText variant="heading">{t('notifications.title')}</AppText>
        {unreadCount > 0 ? (
          <Pressable onPress={() => void markAllRead()} hitSlop={8}>
            <AppText variant="caption" style={styles.markAll}>
              {t('notifications.markAllRead')} ({unreadCount})
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {error ? <AppText color="danger" style={styles.error}>{error}</AppText> : null}
      {items.length === 0 ? (
        <AppText style={styles.empty}>{t('notifications.empty')}</AppText>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const unread = !item.readAt;
            return (
              <Pressable
                style={[styles.card, unread && styles.cardUnread]}
                onPress={() => void openItem(item)}
              >
                <View style={styles.row}>
                  <AppText variant="label" style={styles.title} numberOfLines={2}>
                    {unread ? '● ' : ''}
                    {item.title}
                  </AppText>
                  <AppText variant="caption" color="textMuted" style={styles.date}>
                    {formatDate(item.createdAt)}
                  </AppText>
                </View>
                <AppText color="textMuted" style={styles.body}>{item.body}</AppText>
              </Pressable>
            );
          }}
          ListFooterComponent={
            page < totalPages ? (
              <AppButton
                label={t('notifications.loadMore')}
                variant="ghost"
                onPress={() => setPage((p) => p + 1)}
              />
            ) : undefined
          }
        />
      )}
    </ScreenContainer>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}


function getStyles(colors: Theme['colors']) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing[3],
    },
    markAll: { color: colors.accent },
    error: { marginBottom: spacing[2] },
    empty: { color: colors.textMuted, marginTop: spacing[4], textAlign: 'center' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing[3],
      marginBottom: spacing[2],
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardUnread: { borderColor: colors.accent },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing[2] },
    title: { flex: 1, color: colors.text },
    date: {},
    body: { marginTop: spacing[1] },
  });
}
