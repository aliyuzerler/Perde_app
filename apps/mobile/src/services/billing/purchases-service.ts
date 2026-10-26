/**
 * react-native-purchases (RevenueCat) adaptörü (Faz 7).
 *
 * Güvenlik anlayışı: purchasePackage/restorePurchases sonuçları İSTEMCİ
 * BEYANIDIR. Akış katmanı (billing-flow.ts) bu sonuçları asla tek başına
 * kabul etmez; POST /billing/purchases/validate ile sunucu tarafı
 * doğrulamasına gönderir (Güvenlik-1/2). SDK burada yalnızca mağaza
 * arayüzünü çalıştırır:
 *   - StoreKit / Google Play Billing RevenueCat üzerinden yönetilir,
 *   - fiyatlar mağazadan yerelleştirilmiş gelir (Güvenlik-10),
 *   - app_user_id = PerdeGo kullanıcı kimliği (logIn ile eşlenir).
 *
 * Web ve jest ortamında yerel modül yoktur → supported=false; ekranlar
 * dürüst "desteklenmiyor / yapılandırılmamış" durumu gösterir.
 */
import { Platform } from 'react-native';
import type { PurchasesPort, StoreOffering, StorePackage } from './purchases-port';

export type {
  PurchasesPort,
  StoreOffering,
  StorePackage,
  StorePurchaseResult,
} from './purchases-port';

/**
 * RC SDK tipleri derleme anında bilinir ama yerel modül runtime'da olmayabilir.
 * Tipler loose tutulur; alan erişimleri savunmacıdır (SDK sürüm varyasyonları).
 */
interface RnpProduct {
  identifier: string;
  priceString?: string;
  currencyCode?: string;
  productType?: string;
  introPrice?: { priceString?: string } | null;
}

interface RnpPackage {
  identifier: string;
  product: RnpProduct;
}

interface RnpOffering {
  identifier: string;
  packages: RnpPackage[];
}

interface RnpOfferings {
  current?: RnpOffering | null;
  all?: Record<string, RnpOffering>;
}

interface RnpModule {
  configure(config: { apiKey: string; appUserID?: string }): Promise<void> | void;
  getOfferings(): Promise<RnpOfferings>;
  purchasePackage(pkg: RnpPackage): Promise<{
    productIdentifier?: string;
    transactionIdentifier?: string;
    transactionId?: string;
    customerInfo?: Record<string, unknown>;
  }>;
  restorePurchases(): Promise<{ customerInfo?: Record<string, unknown> }>;
  syncPurchases?(): Promise<void>;
  getCustomerInfo?(): Promise<{ customerInfo?: Record<string, unknown> }>;
}

let rnpModule: RnpModule | null = null;
let configured = false;

/** Yerel SDK'yı gecikmeli yükler; yoksa null (web/jest/native build yok). */
function loadSdk(): RnpModule | null {
  if (rnpModule) return rnpModule;
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const imported = require('react-native-purchases') as unknown;
    if (
      imported &&
      typeof imported === 'object' &&
      typeof (imported as RnpModule).configure === 'function'
    ) {
      rnpModule = imported as RnpModule;
    } else {
      rnpModule =
        (imported as { default?: RnpModule })?.default ??
        null;
    }
    return rnpModule;
  } catch {
    // Yerel modül bağlanamadı (Expo Go / dev derleme).
    return null;
  }
}

function mapPackage(pkg: RnpPackage, offeringIdentifier: string): StorePackage | null {
  const product = pkg?.product;
  if (!product?.identifier) return null;
  const type = product.productType ?? '';
  return {
    packageIdentifier: pkg.identifier,
    offeringIdentifier,
    productId: product.identifier,
    storePriceText: product.priceString ?? '',
    currencyCode: product.currencyCode ?? null,
    introPriceText: product.introPrice?.priceString ?? null,
    productType:
      type.toUpperCase().includes('SUBS')
        ? 'SUBSCRIPTION'
        : type.toUpperCase().includes('CONSUM')
          ? 'CONSUMABLE'
          : 'OTHER',
  };
}

function mapOfferings(raw: RnpOfferings): StoreOffering[] {
  const offerings: StoreOffering[] = [];
  if (raw.current) {
    offerings.push({
      identifier: raw.current.identifier,
      isCurrent: true,
      packages: (raw.current.packages ?? [])
        .map((pkg) => mapPackage(pkg, raw.current!.identifier))
        .filter((pkg): pkg is StorePackage => pkg !== null),
    });
  }
  for (const [identifier, offering] of Object.entries(raw.all ?? {})) {
    if (identifier === raw.current?.identifier) continue;
    offerings.push({
      identifier,
      isCurrent: false,
      packages: (offering.packages ?? [])
        .map((pkg) => mapPackage(pkg, identifier))
        .filter((pkg): pkg is StorePackage => pkg !== null),
    });
  }
  return offerings;
}

/** Satın alma yanıtından işlem kimliğini savunmacı biçimde çıkarır. */
export function extractTransactionId(result: {
  transactionIdentifier?: string;
  transactionId?: string;
  customerInfo?: Record<string, unknown>;
}): string | null {
  if (typeof result.transactionIdentifier === 'string' && result.transactionIdentifier) {
    return result.transactionIdentifier;
  }
  if (typeof result.transactionId === 'string' && result.transactionId) {
    return result.transactionId;
  }
  const newest = result.customerInfo?.['newestTransactionId'];
  return typeof newest === 'string' && newest ? newest : null;
}

/**
 * RC SDK adaptörü. createPurchasesPort() fabrikasıyla oluşturulur.
 */
export function createPurchasesPort(): PurchasesPort {
  return {
    get supported(): boolean {
      return loadSdk() !== null;
    },
    isConfigured(): boolean {
      return configured;
    },
    async configure(args: { publicSdkKey: string; appUserId: string }): Promise<void> {
      const sdk = loadSdk();
      if (!sdk) {
        throw new Error('Mağaza SDK bu cihazda kullanılamıyor');
      }
      await sdk.configure({ apiKey: args.publicSdkKey, appUserID: args.appUserId });
      configured = true;
    },
    async getOfferings(): Promise<StoreOffering[]> {
      const sdk = loadSdk();
      if (!sdk || !configured) return [];
      const offerings = await sdk.getOfferings();
      return mapOfferings(offerings);
    },
    async purchasePackage(args: {
      packageIdentifier: string;
      offeringIdentifier: string;
    }): Promise<{ productId: string; transactionId: string | null }> {
      const sdk = loadSdk();
      if (!sdk || !configured) {
        throw new Error('Mağaza SDK yapılandırılmamış');
      }
      const offerings = await sdk.getOfferings();
      const all = [
        ...(offerings.current ? [offerings.current] : []),
        ...Object.values(offerings.all ?? {}),
      ];
      const pkg = all
        .find((offering) => offering.identifier === args.offeringIdentifier)
        ?.packages.find((candidate) => candidate.identifier === args.packageIdentifier);
      if (!pkg) {
        throw new Error(`Paket bulunamadı: ${args.offeringIdentifier}/${args.packageIdentifier}`);
      }
      const result = await sdk.purchasePackage(pkg);
      return {
        productId: result?.productIdentifier ?? pkg.product.identifier,
        transactionId: extractTransactionId(result ?? {}),
      };
    },
    async restorePurchases(): Promise<{ productId: string; transactionId: string | null }[]> {
      const sdk = loadSdk();
      if (!sdk || !configured) {
        throw new Error('Mağaza SDK yapılandırılmamış');
      }
      const info = await sdk.restorePurchases();
      // RC restore, tüm hakları app_user_id'ye taşır; işlem bazında ayrıntı
      // customerInfo'dan çıkarılır (varsa).
      const nonSubs = (info?.customerInfo?.['nonSubscriptions'] ?? {}) as Record<
        string,
        { transactionIdentifier?: string; storeTransactionId?: string }[]
      >;
      const restored: { productId: string; transactionId: string | null }[] = [];
      for (const [productId, transactions] of Object.entries(nonSubs)) {
        for (const tx of transactions ?? []) {
          restored.push({
            productId,
            transactionId: tx.transactionIdentifier ?? tx.storeTransactionId ?? null,
          });
        }
      }
      return restored;
    },
    async syncSubscriber(): Promise<void> {
      const sdk = loadSdk();
      if (!sdk || !configured) return;
      await sdk.syncPurchases?.();
    },
  };
}

/** Uygulamanın tek mağaza adaptörü örneği. */
export const purchasesPort: PurchasesPort = createPurchasesPort();
