/**
 * Satın alma akışı (Faz 7) — mağaza + sunucu doğrulaması köprüsü.
 *
 * Kural (Güvenlik-1): mağaza satın alma sonucu (purchasePackage yanıtı)
 * İSTEMCİ BEYANIDIR ve asla tek başına kabul edilmez. Akış her satın almayı
 * POST /billing/purchases/validate'a gönderir; sunucu RevenueCat ters
 * sorgusuyla doğrulamayı geçmeyen satın alma hak vermez.
 *
 * Ayrıca:
 *  - validate istekleri Idempotency-Key (BR-06) taşır: ağ tekrarında çift
 *    işlem imkânsızdır.
 *  - restore akışı: restorePurchases → POST /billing/entitlements/sync
 *    (sunucu RC durumunu çeker ve DB'yi eşitler).
 *  - yapılandırılmamış ödeme: PURCHASES_UNCONFIGURED hatası — ekranlar
 *    kullanıcıyı anlaşılır biçimde bilgilendirir, sahte başarı YOK.
 */
import { Platform } from 'react-native';
import type {
  BillingConfigResponse,
  EntitlementSyncResponse,
  PurchaseValidateResponse,
} from '@perdego/contracts';
import type { ContentApiPort } from '../ports';
import type { PurchasesPort, StorePackage, StorePurchaseResult } from './purchases-port';

/** Platform normalizasyonu (react-native Platform → API sözleşmesi). */
const PlatformNorm = {
  get platform(): 'IOS' | 'ANDROID' {
    return Platform.OS === 'android' ? 'ANDROID' : 'IOS';
  },
};

/** Satın alma akışı hatası: ekranın kullanıcıya göstereceği durum. */
export class BillingFlowError extends Error {
  readonly reason:
    | 'NOT_CONFIGURED'
    | 'UNSUPPORTED_DEVICE'
    | 'STORE_FAILED'
    | 'VALIDATION_FAILED'
    | 'UNKNOWN';

  constructor(reason: BillingFlowError['reason'], message: string) {
    super(message);
    this.name = 'BillingFlowError';
    this.reason = reason;
  }
}

export interface BillingFlowDeps {
  api: Pick<
    ContentApiPort,
    'getBillingConfig' | 'validatePurchase' | 'syncEntitlements'
  >;
  purchases: PurchasesPort;
  /** uuid üretici — testlerde deterministik. */
  newIdempotencyKey?: () => string;
}

export function createBillingFlow(deps: BillingFlowDeps) {
  const defaultKey = (): string => {
    const g = globalThis as { crypto?: { randomUUID?: () => string } };
    if (g.crypto?.randomUUID) return g.crypto.randomUUID();
    return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  /**
   * Ödeme yapılandırmasını getirir ve cihaz desteğiyle birlikte karar üretir.
   * Ekranlar bu sonucu "satın al" butonlarını etkinleştirmede kullanır.
   */
  async function resolveBillingState(): Promise<
    | { state: 'ready'; config: BillingConfigResponse }
    | { state: 'unconfigured'; config: BillingConfigResponse | null }
    | { state: 'unsupported-device'; config: BillingConfigResponse }
  > {
    const config = await deps.api.getBillingConfig();
    if (!config.configured) return { state: 'unconfigured', config };
    if (!deps.purchases.supported) return { state: 'unsupported-device', config };
    return { state: 'ready', config };
  }

  /**
   * SDK'yı yapılandırır (app_user_id = PerdeGo kullanıcı kimliği ile).
   */
  async function ensureConfigured(config: BillingConfigResponse, appUserId: string): Promise<void> {
    if (deps.purchases.isConfigured()) return;
    const apiKey = config.revenuecat?.publicSdkKey;
    if (!apiKey) {
      throw new BillingFlowError('NOT_CONFIGURED', 'Public SDK anahtarı yok');
    }
    await deps.purchases.configure({ publicSdkKey: apiKey, appUserId });
  }

  /**
   * Paket satın alır ve sunucuda doğrular. Dönen yanıt yalnızca
   * VALIDATION başarılıysa produce edilir (doğrulanmış hak).
   * pkg=null → ürün mağaza offerings'lerinde yok (RC yapılandırma sorunu);
   * dürüst hata verilir, sahte satın alma üretilmez.
   */
  async function purchaseAndValidate(args: {
    pkg: StorePackage | null;
    appUserId: string;
    productType: 'SUBSCRIPTION' | 'CREDIT_PACK';
  }): Promise<{ purchase: StorePurchaseResult; validation: PurchaseValidateResponse }> {
    const config = await deps.api.getBillingConfig();
    if (!config.configured) {
      throw new BillingFlowError('NOT_CONFIGURED', 'Ödeme yapılandırması tamamlanmadı');
    }
    if (!deps.purchases.supported) {
      throw new BillingFlowError('UNSUPPORTED_DEVICE', 'Bu cihaz mağaza satın almayı desteklemiyor');
    }
    if (!args.pkg) {
      throw new BillingFlowError(
        'STORE_FAILED',
        'Ürün mağaza önerilerinde bulunamadı — RevenueCat offerings yapılandırmasını kontrol edin',
      );
    }
    await ensureConfigured(config, args.appUserId);

    let purchase: StorePurchaseResult;
    try {
      purchase = await deps.purchases.purchasePackage({
        packageIdentifier: args.pkg.packageIdentifier,
        offeringIdentifier: args.pkg.offeringIdentifier,
      });
    } catch (error) {
      throw new BillingFlowError(
        'STORE_FAILED',
        error instanceof Error ? error.message : 'Mağaza satın alması başarısız',
      );
    }

    try {
      // BR-06: her validate isteği benzersiz Idempotency-Key taşır — aynı
      // satın almanın ağ tekrarında çift işlenmesi imkânsızdır.
      const idempotencyKey = deps.newIdempotencyKey?.() ?? defaultKey();
      const validation = await deps.api.validatePurchase({
        platform: PlatformNorm.platform,
        productType: args.productType,
        productId: args.pkg.productId,
        storeTransactionId: purchase.transactionId ?? `unknown:${args.pkg.productId}`,
        appUserId: args.appUserId,
        idempotencyKey,
      });
      return { purchase, validation };
    } catch (error) {
      throw new BillingFlowError(
        'VALIDATION_FAILED',
        error instanceof Error ? error.message : 'Sunucu doğrulaması başarısız',
      );
    }
  }

  /**
   * Geri yükleme: mağazadaki satın almaları RC'ye taşır ve sunucuyu
   * sağlayıcı durumuyla eşitler. Mağaza sonucu beklendiği gibi gelmese
   * bile sunucu senkronu yetkili kaynaktır.
   */
  async function restoreAndSync(args: {
    platform: 'IOS' | 'ANDROID';
    appUserId: string;
  }): Promise<{ restored: StorePurchaseResult[]; sync: EntitlementSyncResponse }> {
    const config = await deps.api.getBillingConfig();
    if (!config.configured) {
      throw new BillingFlowError('NOT_CONFIGURED', 'Ödeme yapılandırması tamamlanmadı');
    }
    if (!deps.purchases.supported) {
      throw new BillingFlowError('UNSUPPORTED_DEVICE', 'Bu cihaz mağaza satın almayı desteklemiyor');
    }
    await ensureConfigured(config, args.appUserId);

    let restored: StorePurchaseResult[] = [];
    try {
      restored = await deps.purchases.restorePurchases();
      await deps.purchases.syncSubscriber();
    } catch (error) {
      throw new BillingFlowError(
        'STORE_FAILED',
        error instanceof Error ? error.message : 'Mağaza geri yükleme başarısız',
      );
    }

    try {
      const sync = await deps.api.syncEntitlements({ platform: args.platform });
      return { restored, sync };
    } catch (error) {
      throw new BillingFlowError(
        'VALIDATION_FAILED',
        error instanceof Error ? error.message : 'Sunucu senkronu başarısız',
      );
    }
  }

  return { resolveBillingState, ensureConfigured, purchaseAndValidate, restoreAndSync };
}
