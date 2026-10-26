/**
 * Ödeme durumu kancası (Faz 7) — ekranların paylaştığı tek karar noktası.
 *
 * Durumlar:
 *  - 'ready'               → mağaza akışı çalıştırılabilir
 *  - 'unconfigured'        → sunucuda ödeme yapılandırılmamış (provider=none):
 *                            satın alma başlatılmaz, kullanıcı anlaşılır
 *                            biçimde bilgilendirilir (Güvenlik-9 — sahte
 *                            başarı yok)
 *  - 'unsupported-device'  → ödeme yapılandırılmış ama cihaz (web / Expo Go
 *                            / native derleme yok) mağaza SDK'sını çalıştıramaz
 *
 * SDK yapılandırması burada yapılır: config hazır + oturum açıkken RC SDK
 * public anahtar ve PerdeGo kullanıcı kimliğiyle (app_user_id) kurulur;
 * offerings fiyatları mağazadan yerelleştirilmiş gelir (Güvenlik-10).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BillingConfigResponse } from '@perdego/contracts';
import { contentApi } from '@/services/adapter';
import { purchasesPort, type StoreOffering } from '@/services/billing/purchases-service';
import { useAuthStore } from '@/store/auth-store';
import { queryKeys } from '@/hooks/queries/query-keys';

export type BillingState =
  | 'loading'
  | 'ready'
  | 'unconfigured'
  | 'unsupported-device';

export interface BillingStateResult {
  state: BillingState;
  /** Sunucu yapılandırması (yüklendiyse). */
  config: BillingConfigResponse | null;
  /** Mağaza önerileri (SDK kurulup offerings getirildiyse doldurulur). */
  offerings: StoreOffering[];
  retry: () => void;
}

export function useBillingState(): BillingStateResult {
  const configQuery = useQuery({
    queryKey: queryKeys.billingConfig,
    queryFn: () => contentApi.getBillingConfig(),
    staleTime: 60_000,
  });

  const config = configQuery.data ?? null;
  const offeringsQuery = useQuery({
    queryKey: queryKeys.storeOfferings,
    queryFn: async (): Promise<StoreOffering[]> => {
      if (!config?.configured) return [];
      const apiKey = config.revenuecat?.publicSdkKey;
      const appUserId = useAuthStore.getState().session?.user.id;
      if (!apiKey || !appUserId) return [];
      if (!purchasesPort.isConfigured()) {
        await purchasesPort.configure({ publicSdkKey: apiKey, appUserId });
      }
      return purchasesPort.getOfferings();
    },
    enabled: Boolean(config?.configured) && purchasesPort.supported,
    staleTime: 300_000,
  });

  const state: BillingState = useMemo(() => {
    if (!configQuery.isSuccess) return 'loading';
    if (!config) return 'loading';
    if (!config.configured) return 'unconfigured';
    if (!purchasesPort.supported) return 'unsupported-device';
    return 'ready';
  }, [configQuery.isSuccess, config]);

  return {
    state,
    config,
    offerings: offeringsQuery.data ?? [],
    retry: () => {
      void configQuery.refetch();
      void offeringsQuery.refetch();
    },
  };
}
