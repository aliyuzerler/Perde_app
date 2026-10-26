/**
 * Mağaza satın alma portu (Faz 7) — react-native-purchases soyutlaması.
 *
 * Neden port: RevenueCat SDK'sı yerel modüldür; ekranlar ve akış testleri
 * bu arayüzü bilir, gerçek SDK bağlantısı tek yerdedir (adaptasyon kuralı
 * mock/HTTP adapter ile aynı).
 *
 * Fiyat kuralları (Güvenlik-10): fiyatlar istemcide SABİTLENMEZ —
 * offering'lerden gelen mağaza yerelleştirilmiş fiyat metni
 * (storePriceText) ve para birimi kullanılır. Sunucu /billing/products
 * fiyatları yalnızca mağaza bağlantısı olmadığında bilgilendirme amaçlıdır.
 */
export interface StorePackage {
  /** RC package kimliği ($rc_monthly, $rc_annual, özel paketler). */
  packageIdentifier: string;
  /** Öneri (offering) kimliği. */
  offeringIdentifier: string;
  /** Mağaza ürün kimliği (RC product_id — sunucu çözümlemesi bundan yapılır). */
  productId: string;
  /** Mağazadan dönen yerelleştirilmiş fiyat metni (örn. "₺49,90"). */
  storePriceText: string;
  /** Mağaza para birimi kodu (ISO 4217). */
  currencyCode: string | null;
  /** Tanıtım/deneme dönem fiyat metni (yoksa null). */
  introPriceText: string | null;
  /** Ürün tipi — abonelik mi tüketilebilir mi. */
  productType: 'SUBSCRIPTION' | 'CONSUMABLE' | 'OTHER';
}

export interface StoreOffering {
  identifier: string;
  /** RC currentOffering işareti. */
  isCurrent: boolean;
  packages: StorePackage[];
}

export interface StorePurchaseResult {
  /** Satın alınan mağaza ürün kimliği. */
  productId: string;
  /** Mağaza/RC işlem kimliği (sunucu doğrulamasına gider; yoksa boş). */
  transactionId: string | null;
}

/**
 * Mağaza satın alma portu. Yerel SDK gerektirir; web ve native derleme
 * olmadan çalışmaz (implementasyon destek durumunu bildirir).
 */
export interface PurchasesPort {
  /** Cihaz mağaza satın almayı destekliyor mu? (web: false) */
  readonly supported: boolean;
  /** SDK yapılandırıldı mı? */
  isConfigured(): boolean;
  /** RC SDK'yı herkese açık anahtar + PerdeGo kullanıcı kimliğiyle kurar. */
  configure(args: { publicSdkKey: string; appUserId: string }): Promise<void>;
  /** Önerileri (offering'leri) getirir — fiyatlar mağazadan gelir. */
  getOfferings(): Promise<StoreOffering[]>;
  /** Paket satın alır; sonuç istemci beyanıdır — sunucu doğrulaması zorunlu. */
  purchasePackage(args: {
    packageIdentifier: string;
    offeringIdentifier: string;
  }): Promise<StorePurchaseResult>;
  /** Mağazadaki önceki satın almaları geri yükler. */
  restorePurchases(): Promise<StorePurchaseResult[]>;
  /** RC tarafı abonelik durumunu hemen senkronlar. */
  syncSubscriber(): Promise<void>;
}
