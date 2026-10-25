/**
 * Paywall — abonelik paketleri (Faz 3: mock satın alma; canlı IAP Faz 5'te).
 * Plan seçimi → mock subscribe → cüzdan durumunu günceller (query invalidate).
 * Gerçek ödeme asla tetiklenmez; ekranda mock uyarısı görünürdür.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, ScrollView, View, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { queryKeys } from '@/hooks/queries/query-keys';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { PriceCard } from '@/components/ui/price-card';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { spacing } from '@/theme/tokens';
import { formatKurus } from '@/utils/format';

export default function PaywallScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const params = useLocalSearchParams<{ from?: string }>();
  const fromEpisode = params.from === 'player';
  const queryClient = useQueryClient();

  const plans = useQuery({
    queryKey: queryKeys.plans,
    queryFn: () => contentApi.getSubscriptionPlans(),
  });
  const wallet = useQuery({
    queryKey: queryKeys.wallet,
    queryFn: () => contentApi.getWallet(),
  });

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  const subscribe = useMutation({
    mutationFn: (planId: string) => contentApi.subscribe(planId),
    onSuccess: () => {
      setSubscribed(true);
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
    },
  });

  const bestPlanId = useMemo(
    () => plans.data?.plans.find((plan) => plan.isBestValue)?.id ?? null,
    [plans.data]
  );

  const activePlanId = selectedPlanId ?? bestPlanId;

  return (
    <ScreenContainer>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        <AppText variant="display">{t('paywall.title')}</AppText>
        <AppText variant="body" color="textMuted">
          {t('paywall.subtitle')}
        </AppText>

        {plans.isPending ? (
          <LoadingView variant="list" />
        ) : plans.isError ? (
          <ErrorView
            title={t('error.genericTitle')}
            body={t('error.genericBody')}
            onRetry={() => plans.refetch()}
          />
        ) : (
          <>
            <AppText variant="label" color="textSubtle" style={styles.selectLabel}>
              {t('paywall.selectPlan')}
            </AppText>
            {plans.data.plans.map((plan) => (
              <PriceCard
                key={plan.id}
                title={plan.name}
                priceText={formatKurus(plan.priceKurus)}
                subText={
                  plan.monthlyEquivalentKurus
                    ? t('paywall.monthlyEquivalent', {
                        price: formatKurus(plan.monthlyEquivalentKurus),
                      })
                    : undefined
                }
                badges={[
                  ...(plan.isBestValue
                    ? [{ label: t('content.newBadge'), tone: 'accent' as const }]
                    : []),
                ]}
                bullets={plan.benefits}
                selected={activePlanId === plan.id}
                onPress={() => setSelectedPlanId(plan.id)}
              />
            ))}

            {wallet.data?.wallet.subscriptionStatus === 'TRIALING' && !subscribed ? (
              <AppText variant="caption" color="textSubtle">
                {t('paywall.trialNote', { count: 7 })}
              </AppText>
            ) : null}

            {subscribed ? (
              <View style={styles.successPanel}>
                <AppText variant="heading" style={{ color: theme.colors.success }}>
                  {t('paywall.successTitle')}
                </AppText>
                <AppText variant="body" color="textMuted">
                  {t('paywall.successBody')}
                </AppText>
                <AppButton label={t('common.close')} onPress={() => router.back()} />
              </View>
            ) : (
              <View style={styles.ctaWrap}>
                <AppButton
                  label={t('paywall.subscribe')}
                  onPress={() => {
                    if (activePlanId) subscribe.mutate(activePlanId);
                  }}
                  disabled={!activePlanId || subscribe.isPending}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.back()}
                  style={styles.restoreButton}
                >
                  <AppText variant="caption" color="textSubtle">
                    {t('paywall.restore')}
                  </AppText>
                </Pressable>
              </View>
            )}

            <AppText variant="caption" color="textSubtle" style={styles.notice}>
              {t('paywall.mockNotice')}
              {fromEpisode ? ` • ${t('player.lockedSubscriptionBody')}` : ''}
            </AppText>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const getStyles = (colors: ReturnType<typeof useTheme>['theme']['colors']) =>
  StyleSheet.create({
    topBar: {
      alignItems: 'flex-end',
      paddingHorizontal: spacing[4],
      paddingTop: spacing[2],
    },
    closeButton: {
      minHeight: 44,
      minWidth: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      padding: spacing[4],
      gap: spacing[3],
      paddingBottom: spacing[6],
    },
    selectLabel: {
      marginTop: spacing[2],
    },
    ctaWrap: {
      gap: spacing[2],
      marginTop: spacing[2],
    },
    restoreButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notice: {
      textAlign: 'center',
      marginTop: spacing[2],
    },
    successPanel: {
      gap: spacing[2],
      padding: spacing[4],
      borderWidth: 1,
      borderColor: colors.success,
      borderRadius: 4,
      backgroundColor: colors.surface,
      marginTop: spacing[2],
    },
  });
