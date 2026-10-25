/**
 * Etkin oturumlar ekranı — hesabın açık olduğu cihazlar; tek tek kapatma
 * veya tümünü kapatma (oturum iptali kuralı).
 */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
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
import type { AuthSessionInfo } from '@perdego/contracts';

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('tr-TR', { dateStyle: 'medium' });
}

export default function SessionsScreen() {
  const { theme } = useTheme();
  const t = useT();
  const describeError = useDescribeApiError();
  const styles = getStyles(theme.colors);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const sessions = useQuery({
    queryKey: queryKeys.authSessions,
    queryFn: () => contentApi.getSessions(),
  });

  const revoke = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await contentApi.revokeSession(id);
        await queryClient.invalidateQueries({ queryKey: queryKeys.authSessions });
      } catch (err) {
        setError(describeError(err));
      }
    },
    [queryClient, describeError]
  );

  const logoutAll = useCallback(async () => {
    setError(null);
    try {
      await contentApi.logoutAll();
      await queryClient.invalidateQueries({ queryKey: queryKeys.authSessions });
    } catch (err) {
      setError(describeError(err));
    }
  }, [queryClient, describeError]);

  const renderItem = (session: AuthSessionInfo) => (
    <View key={session.id} style={styles.row}>
      <Ionicons
        name={session.current ? 'phone-portrait' : 'desktop-outline'}
        size={22}
        color={theme.colors.textMuted}
      />
      <View style={styles.rowTexts}>
        <AppText variant="body">{session.userAgent ?? '—'}</AppText>
        <AppText variant="caption" color="textSubtle">
          {formatDateTime(session.createdAt)}
          {session.current ? ` · ${t('auth.currentSession')}` : ''}
        </AppText>
      </View>
      {!session.current ? (
        <AppButton
          label={t('auth.revokeSession')}
          variant="secondary"
          onPress={() => void revoke(session.id)}
        />
      ) : null}
    </View>
  );

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.body}>
        <AppText variant="display">{t('auth.sessionsTitle')}</AppText>
        <AppText variant="body" color="textMuted">
          {t('auth.sessionsBody')}
        </AppText>

        {sessions.isLoading ? <LoadingView variant="list" /> : null}
        {sessions.isError ? (
          <ErrorView
            title={t('auth.errorGeneric')}
            onRetry={() => void sessions.refetch()}
          />
        ) : null}
        {sessions.data ? (
          <View style={styles.list}>
            {sessions.data.items.map(renderItem)}
          </View>
        ) : null}

        {error ? (
          <AppText variant="caption" style={{ color: theme.colors.accent }} accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}

        <AppButton
          label={t('auth.logoutAll')}
          variant="secondary"
          onPress={() => void logoutAll()}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

const getStyles = (colors: ReturnType<typeof useTheme>['theme']['colors']) => ({
  body: {
    padding: spacing[4],
    paddingTop: spacing[5],
    gap: spacing[3],
  },
  list: {
    gap: spacing[2],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing[3],
    padding: spacing[3],
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
});
