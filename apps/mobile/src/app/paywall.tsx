/**
 * Paywall — abonelik paketleri (Faz 7: gerçek mağaza akışı).
 *
 * Fiyat kuralları (Güvenlik-10): plan fiyatları istemcide sabitlenmez;
 * RC offerings'ten gelen mağaza yerelleştirilmiş fiyat metni kullanılır.
 * Mağaza bağlantısı yokken sunucu /billing/products fiyatları bilgilendirme
 * amaçlı gösterilir.
 *
 * Satın alma akışı: RC purchasePackage → POST /billing/purchases/validate
 * (Idempotency-Key ile). Mağaza sonucu istemcide asla tek başına kabul
 * edilmez; doğrulama başarısızsa kullanıcıya dürüst hata gösterilir.
 * Geri Yükleme: restorePurchases + POST /billing/entitlements/sync.
 */
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, ScrollView, View, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import {
  createBillingFlow,
  BillingFlowError,
} from '@/services/billing/billing-flow';
import { purchasesPort, type StorePackage } from '@/services/billing/purchases-service';
import { useBillingState } from '@/hooks/use-billing-state';
import { useAuthStore } from '@/store/auth-store';
import { queryKeys } from '@/hooks/queries/query-keys';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { PriceCard } from '@/components/ui/price-card';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { BillingNotice } from '@/components/billing/billing-notice';
import { spacing } from '@/theme/tokens';
import { formatKurus } from '@/utils/format';

const billingFlow = createBillingFlow({ api: contentApi, purchases: purchasesPort });

export default function PaywallScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const params = useLocalSearchParams<{ from?: string }>();
  const fromEpisode = params.from === 'player';
  const queryClient = useQueryClient();

  const billing = useBillingState();
  const plans = useQuery({
    queryKey: queryKeys.plans,
    queryFn: () => contentApi.getSubscriptionPlans(),
  });

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);

  const subscribe = useMutation({
    mutationFn: async (planId: string) => {
      const appUserId = useAuthStore.getState().session?.user.id;
      if (!appUserId) throw new BillingFlowError('NOT_CONFIGURED', t('error.authRequired'));
      const product = billing.config?.subscriptionProducts.find((p) => p.planId === planId);
      const productId = product
        ? /* platforma göre mağaza ürün kimliği */
          product.productIds.ios
        : planId;
      const pkg = findPackageForProduct(billing.offerings, productId);
      return billingFlow.purchaseAndValidate({
        pkg,
        appUserId,
        productType: 'SUBSCRIPTION',
      });
    },
    onSuccess: () => {
      setSubscribed(true);
      setFlowError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
    },
    onError: (error) => {
      setFlowError(
        error instanceof BillingFlowError ? error.message : t('billing.flowFailed'),
      );
    },
  });

  const restore = useMutation({
    mutationFn: () => {
      const appUserId = useAuthStore.getState().session?.user.id;
      if (!appUserId) throw new BillingFlowError('NOT_CONFIGURED', t('error.authRequired'));
      return billingFlow.restoreAndSync({
        platform: purchasesPlatform(),
        appUserId,
      });
    },
    onSuccess: () => {
      setFlowError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
    },
    onError: (error) => {
      setFlowError(
        error instanceof BillingFlowError ? error.message : t('billing.flowFailed'),
      );
    },
  });

  const bestPlanId = useMemo(
    () => plans.data?.plans.find((plan) => plan.isBestValue)?.id ?? null,
    [plans.data]
  );

  const activePlanId = selectedPlanId ?? bestPlanId;
  const purchaseEnabled =
    billing.state === 'ready' && Boolean(activePlanId) && !subscribe.isPending;

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

        {billing.state === 'unconfigured' || billing.state === 'unsupported-device' ? (
          <BillingNotice variant={billing.state} />
        ) : null}

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
            {plans.data.plans.map((plan) => {
              const product = billing.config?.subscriptionProducts.find(
                (p) => p.planId === plan.id
              );
              const pkg = product
                ? findPackageForProduct(
                    billing.offerings,
                    purchasesPlatform() === 'ANDROID' ? product.productIds.android : product.productIds.ios
                  )
                : null;
              // Güvenlik-10: fiyat mağazadan; yoksa sunucu bilgilendirme fiyatı.
              const priceText = pkg?.storePriceText || formatKurus(plan.priceKurus);
              return (
                <PriceCard
                  key={plan.id}
                  title={plan.name}
                  priceText={priceText}
                  subText={
                    pkg?.introPriceText
                      ? t('paywall.introPrice', { price: pkg.introPriceText })
                      : plan.monthlyEquivalentKurus
                        ? t('paywall.monthlyEquivalent', {
                            price: formatKurus(plan.monthlyEquivalentKurus),
                          })
                        : undefined
                  }
                  badges={[
                    ...(plan.isBestValue
                      ? [{ label: t('content.newBadge'), tone: 'accent' as const }]
                      : []),
                    ...(pkg?.introPriceText
                      ? [{ label: t('paywall.trialBadge'), tone: 'accent' as const }]
                      : []),
                  ]}
                  bullets={plan.benefits}
                  selected={activePlanId === plan.id}
                  onPress={() => setSelectedPlanId(plan.id)}
                  disabled={billing.state !== 'ready'}
                />
              );
            })}

            {flowError ? (
              <AppText variant="caption" style={{ color: theme.colors.warning }}>
                {flowError}
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
                  label={
                    subscribe.isPending
                      ? t('billing.purchasing')
                      : t('paywall.subscribe')
                  }
                  onPress={() => {
                    if (activePlanId) subscribe.mutate(activePlanId);
                  }}
                  disabled={!purchaseEnabled}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('paywall.restore')}
                  onPress={() => restore.mutate()}
                  style={styles.restoreButton}
                  disabled={billing.state !== 'ready' || restore.isPending}
                >
                  <AppText variant="caption" color="textSubtle">
                    {restore.isPending ? t('billing.restoring') : t('paywall.restore')}
                  </AppText>
                </Pressable>
              </View>
            )}

            <AppText variant="caption" color="textSubtle" style={styles.notice}>
              {t('paywall.storeNotice')}
              {fromEpisode ? ` • ${t('player.lockedSubscriptionBody')}` : ''}
            </AppText>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

/** Platforma göre sunduğum paket: abonelikse SUBSCRIPTION tipi tercih edilir. */
function findPackageForProduct(
  offerings: ReturnType<typeof useBillingState>['offerings'],
  productId: string
): StorePackage | null {
  for (const offering of offerings) {
    for (const pkg of offering.packages) {
      if (pkg.productId === productId) return pkg;
    }
  }
  return null;
}

function purchasesPlatform(): 'IOS' | 'ANDROID' {
  return Platform.OS === 'android' ? 'ANDROID' : 'IOS';
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
