/**
 * Erişim türü yardımcıları.
 * Kilit kararları sunucuda verilir; istemci yalnızca sunucunun verdiği
 * accessType'ı görüntüler (Genel Kural 10).
 */
import type { AccessType } from '@perdego/contracts';

export interface AccessVisual {
  /** i18n anahtarı (access bölümünde tanımlı). */
  labelKey: 'FREE' | 'SUBSCRIPTION' | 'CREDIT';
  /** Kart üstünde küçük rozet olarak gösterilir. */
  showBadge: boolean;
  /** Kilit ikonu gösterilecek mi. */
  locked: boolean;
}

export function getAccessVisual(accessType: AccessType): AccessVisual {
  switch (accessType) {
    case 'SUBSCRIPTION':
      return { labelKey: 'SUBSCRIPTION', showBadge: true, locked: true };
    case 'CREDIT':
      return { labelKey: 'CREDIT', showBadge: true, locked: true };
    case 'FREE':
    default:
      return { labelKey: 'FREE', showBadge: false, locked: false };
  }
}
