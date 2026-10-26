/**
 * Bildirim tercihleri ekranı (FAZ 9).
 *
 * system tercihi salt okunurdur (ERD): satın alma/işlem bilgilendirmeleri
 * kapatılamaz — dürüst açıklama metniyle gösterilir. Diğer üç tercih toggle.
 */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { queryKeys } from '@/hooks/queries/query-keys';
import { useDescribeApiError } from '@/utils/api-error';
import { radius, spacing } from '@/theme/tokens';
import type { Theme } from '@/theme';

export default function NotificationPreferencesScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const queryClient = useQueryClient();
  const describeError = useDescribeApiError();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const preferences = useQuery({
    queryKey: queryKeys.notificationPreferences,
    queryFn: () => contentApi.getNotificationPreferences(),
  });

  const toggle = useCallback(
    async (field: 'newEpisode' | 'newContent' | 'promo', value: boolean) => {
      setError(null);
      setBusy(field);
      try {
        await contentApi.updateNotificationPreferences({ [field]: value });
        await queryClient.invalidateQueries({ queryKey: queryKeys.notificationPreferences });
      } catch (err) {
        setError(describeError(err));
      } finally {
        setBusy(null);
      }
    },
    [queryClient, describeError],
  );

  if (preferences.isLoading) return <LoadingView variant="list" />;
  if (preferences.isError) {
    return (
      <ErrorView
        title={t('notifications.preferencesLoadError')}
        retryLabel={t('common.retry')}
        onRetry={() => void preferences.refetch()}
      />
    );
  }

  const prefs = preferences.data;
  if (!prefs) return <ErrorView title={t('notifications.preferencesLoadError')} />;

  const rows: { key: 'newEpisode' | 'newContent' | 'promo'; label: string; hint: string }[] = [
    { key: 'newEpisode', label: t('notifications.prefNewEpisode'), hint: t('notifications.prefNewEpisodeHint') },
    { key: 'newContent', label: t('notifications.prefNewContent'), hint: t('notifications.prefNewContentHint') },
    { key: 'promo', label: t('notifications.prefPromo'), hint: t('notifications.prefPromoHint') },
  ];

  return (
    <ScreenContainer>
      <ScrollView bounces={false}>
        <AppText variant="heading">{t('notifications.preferencesTitle')}</AppText>
        <View style={styles.group}>
          {rows.map((row) => (
            <View key={row.key} style={styles.row}>
              <View style={styles.textCol}>
                <AppText style={styles.label}>{row.label}</AppText>
                <AppText color="textMuted" style={styles.hint}>{row.hint}</AppText>
              </View>
              <Switch
                value={prefs[row.key]}
                disabled={busy !== null}
                onValueChange={(value) => void toggle(row.key, value)}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
              />
            </View>
          ))}
          <View style={[styles.row, styles.last]}>
            <View style={styles.textCol}>
              <AppText style={styles.label}>{t('notifications.prefSystem')}</AppText>
              <AppText color="textMuted" style={styles.hint}>
                {t('notifications.prefSystemHint')}
              </AppText>
            </View>
            <Switch value={true} disabled={true} trackColor={{ true: theme.colors.border }} />
          </View>
        </View>
        {error ? <AppText color="danger" style={styles.error}>{error}</AppText> : null}
      </ScrollView>
    </ScreenContainer>
  );
}


function getStyles(colors: Theme['colors']) {
  return StyleSheet.create({
    group: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: spacing[3],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing[3],
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    last: { borderBottomWidth: 0 },
    textCol: { flex: 1, paddingRight: spacing[3] },
    label: { color: colors.text },
    hint: { marginTop: spacing[1] },
    error: { marginTop: spacing[3] },
  });
}
