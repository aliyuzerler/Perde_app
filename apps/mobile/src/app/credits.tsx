/**
 * Kredi mağazası ve cüzdan (Faz 7: gerçek mağaza akışı).
 *
 * - Bakiye ve hareket geçmişi sunucudan (credit_ledger salt okunur).
 * - Paket satın alma RC SDK ile yapılır; fiyat mağazadan gelir
 *   (Güvenlik-10), sunucu /billing/products fiyatı bilgilendirme amaçlıdır.
 * - Mağaza sonucu istemcide kabul edilmez: purchase → POST validate
 *   (Idempotency-Key) zinciri zorunludur; doğrulama hatasında dürüst mesaj.
 * - Yapılandırılmamış ödeme / desteklenmeyen cihazda satın alma devre dışı
 *   ve nedeni kullanıcıya açıkça bildirilir (Güvenlik-9).
 */
import { useState } from 'react';
import { Platform, StyleSheet, ScrollView, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { createBillingFlow, BillingFlowError } from '@/services/billing/billing-flow';
import { purchasesPort, type StorePackage } from '@/services/billing/purchases-service';
import { useBillingState } from '@/hooks/use-billing-state';
import { useAuthStore } from '@/store/auth-store';
import { queryKeys } from '@/hooks/queries/query-keys';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { PriceCard } from '@/components/ui/price-card';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { BillingNotice } from '@/components/billing/billing-notice';
import { spacing } from '@/theme/tokens';
import { formatKurus } from '@/utils/format';

const billingFlow = createBillingFlow({ api: contentApi, purchases: purchasesPort });

export default function CreditsScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const queryClient = useQueryClient();
  const [lastPurchased, setLastPurchased] = useState<number | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);

  const billing = useBillingState();
  const wallet = useQuery({
    queryKey: queryKeys.wallet,
    queryFn: () => contentApi.getWallet(),
  });
  const packs = useQuery({
    queryKey: queryKeys.creditPacks,
    queryFn: () => contentApi.getCreditPacks(),
  });
  const transactions = useQuery({
    queryKey: queryKeys.walletTransactions,
    queryFn: () => contentApi.getWalletTransactions(),
  });

  const purchase = useMutation({
    mutationFn: async (packId: string) => {
      const appUserId = useAuthStore.getState().session?.user.id;
      if (!appUserId) throw new BillingFlowError('NOT_CONFIGURED', t('error.authRequired'));
      const product = billing.config?.creditPackProducts.find((p) => p.packId === packId);
      const productId = product
        ? purchasesPlatform() === 'ANDROID'
          ? product.productIds.android
          : product.productIds.ios
        : packId;
      const pkg = findPackageForProduct(billing.offerings, productId);
      return billingFlow.purchaseAndValidate({
        pkg,
        appUserId,
        productType: 'CREDIT_PACK',
      });
    },
    onSuccess: (result) => {
      setFlowError(null);
      setLastPurchased(result.validation.wallet?.purchased ?? null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
      void queryClient.invalidateQueries({ queryKey: queryKeys.walletTransactions });
    },
    onError: (error) => {
      setFlowError(
        error instanceof BillingFlowError ? error.message : t('billing.flowFailed'),
      );
    },
  });

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
        {/* Bakiye kartı */}
        <View style={[styles.balanceCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <AppText variant="label" color="textSubtle">
            {t('credits.balance')}
          </AppText>
          <AppText variant="display" style={styles.balanceValue}>
            {wallet.data ? wallet.data.wallet.creditBalance : '—'}
          </AppText>
          {wallet.data ? (
            <AppText variant="caption" color="textSubtle">
              {wallet.data.wallet.purchasedCredits} {t('credits.purchasedLabel')} •{' '}
              {wallet.data.wallet.grantedCredits} {t('credits.grantedLabel')}
            </AppText>
          ) : null}
          {lastPurchased !== null && !purchase.isPending ? (
            <AppText variant="caption" style={{ color: theme.colors.success }}>
              {t('credits.successBody', { count: lastPurchased })}
            </AppText>
          ) : null}
        </View>

        {/* Ödeme durumu — dürüst bildirim (sahte başarı yok) */}
        {billing.state === 'unconfigured' || billing.state === 'unsupported-device' ? (
          <BillingNotice variant={billing.state} />
        ) : null}
        {flowError ? (
          <AppText variant="caption" style={{ color: theme.colors.warning }}>
            {flowError}
          </AppText>
        ) : null}

        {/* Paketler */}
        <AppText variant="heading">{t('credits.packsTitle')}</AppText>
        {packs.isPending ? (
          <LoadingView variant="list" />
        ) : packs.isError ? (
          <ErrorView
            title={t('error.genericTitle')}
            body={t('error.genericBody')}
            onRetry={() => packs.refetch()}
          />
        ) : (
          packs.data.packs.map((pack) => {
            const product = billing.config?.creditPackProducts.find(
              (p) => p.packId === pack.id
            );
            const pkg = product
              ? findPackageForProduct(
                  billing.offerings,
                  purchasesPlatform() === 'ANDROID'
                    ? product.productIds.android
                    : product.productIds.ios
                )
              : null;
            const priceText = pkg?.storePriceText || formatKurus(pack.priceKurus);
            return (
              <PriceCard
                key={pack.id}
                title={`${pack.credits} Kredi`}
                priceText={priceText}
                subText={
                  pack.bonusCredits > 0
                    ? `+${pack.bonusCredits} bonus kredi`
                    : undefined
                }
                badges={
                  pack.isBestValue
                    ? [{ label: t('content.newBadge'), tone: 'accent' as const }]
                    : undefined
                }
                onPress={() => purchase.mutate(pack.id)}
                disabled={billing.state !== 'ready' || purchase.isPending}
              />
            );
          })
        )}

        {/* Hareketler */}
        <AppText variant="heading" style={styles.historyTitle}>
          {t('credits.historyTitle')}
        </AppText>
        {transactions.isPending ? (
          <LoadingView variant="list" />
        ) : transactions.isError ? (
          <ErrorView
            title={t('error.genericTitle')}
            body={t('error.genericBody')}
            onRetry={() => transactions.refetch()}
          />
        ) : (
          <View style={styles.txList}>
            {transactions.data.items.map((tx) => (
              <View
                key={tx.id}
                style={[styles.txRow, { borderBottomColor: theme.colors.border }]}
              >
                <View style={styles.txTexts}>
                  <AppText variant="body">{tx.label}</AppText>
                  <AppText variant="caption" color="textSubtle">
                    {tx.createdAt.slice(0, 10)} • bakiye {tx.balanceAfter}
                  </AppText>
                </View>
                <AppText
                  variant="heading"
                  style={{ color: tx.amount >= 0 ? theme.colors.success : theme.colors.accent }}
                >
                  {tx.amount >= 0 ? `+${tx.amount}` : `${tx.amount}`}
                </AppText>
              </View>
            ))}
          </View>
        )}

        <AppText variant="caption" color="textSubtle" style={styles.notice}>
          {t('credits.storeNotice')}
        </AppText>
      </ScrollView>
    </ScreenContainer>
  );
}

/** Platforma göre sunduğum paket. */
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
    balanceCard: {
      borderRadius: 4,
      borderWidth: 1,
      padding: spacing[4],
      gap: spacing[1],
      alignItems: 'center',
    },
    balanceValue: {
      color: colors.accent,
    },
    historyTitle: {
      marginTop: spacing[3],
    },
    txList: {
      gap: spacing[3],
    },
    txRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing[3],
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingBottom: spacing[2],
    },
    txTexts: {
      flex: 1,
      gap: 2,
    },
    notice: {
      textAlign: 'center',
      marginTop: spacing[2],
    },
  });
