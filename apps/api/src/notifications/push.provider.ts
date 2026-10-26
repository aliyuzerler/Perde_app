/**
 * Push sağlayıcı portu (FAZ 9) — MediaProviderPort/BillingProviderPort
 * deseninde. Uygulama içi bildirimden bağımsız olarak push fan-out'u
 * yönetir; sırlar ve ödeme verileri payload'a ASLA girmez (izin listesi
 * PushDispatchService'te uygulanır).
 *
 *  - ExpoPushProvider: gerçek Expo push servisi (exp.host) — 100'lük
 *    parçalarla gönderir, biletleme yanıtını ticket'a çevirir.
 *  - SimulatedPushProvider: yalnız dev/test (üretimde env refine reddeder);
 *    token'da "invalid" geçiyorsa DeviceNotRegistered döner (temizlik akışı
 *    test edilebilir). SAHTE BAŞARI üretimde imkânsız.
 */
export interface PushMessage {
  /** Gönderim satırı kimliği — bilet geri dönüşünde eşleştirme için (FAZ 9).
   * Aynı cihaza farklı bildirimler gidebilir; deviceId tek başına anahtar değildir. */
  sendId: string;
  deviceId: string;
  pushToken: string;
  title: string;
  body: string;
  /** İzin listeli derin bağlantı verisi (düz anahtarlar — Expo data alanı). */
  data: Record<string, string>;
}

export interface PushTicket {
  sendId: string;
  deviceId: string;
  ok: boolean;
  ticketId?: string;
  reason?: string;
  /** Sağlayıcı bu token'ın artık kayıtlı olmadığını bildirdi. */
  deviceNotRegistered?: boolean;
}

export interface PushProviderPort {
  readonly name: 'expo' | 'simulated' | 'none';
  sendBatch(messages: PushMessage[]): Promise<PushTicket[]>;
}

const DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';

/** Expo push token biçimi (ExponentPushToken[...] / ExponentPushToken[...]). */
export const isExpoPushTokenFormat = (token: string): boolean =>
  token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');

export class ExpoPushProvider implements PushProviderPort {
  readonly name = 'expo' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async sendBatch(messages: PushMessage[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      tickets.push(...(await this.sendChunk(chunk)));
    }
    return tickets;
  }

  private async sendChunk(chunk: PushMessage[]): Promise<PushTicket[]> {
    const body = chunk.map((m) => ({
      to: m.pushToken,
      title: m.title,
      body: m.body,
      data: m.data,
      sound: 'default',
    }));
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/--/api/v2/push/send`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Expo push: host'a göre gzip otomatik; ek başlık gerekmez.
          'accept': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // Ağ hatası: tüm chunk PENDING kalsın (dispatch yeniden dener).
      throw new PushProviderUnreachableError(String(err));
    }
    if (!res.ok) {
      throw new PushProviderUnreachableError(`Expo push HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: Array<{
        status: 'ok' | 'error';
        id?: string;
        message?: string;
        details?: { error?: string };
      }>;
    };
    const items = json.data ?? [];
    return chunk.map((m, idx) => {
      const item = items[idx];
      if (!item) {
        return { sendId: m.sendId, deviceId: m.deviceId, ok: false, reason: 'Bilet eksik' };
      }
      if (item.status === 'ok' && item.id) {
        return { sendId: m.sendId, deviceId: m.deviceId, ok: true, ticketId: item.id };
      }
      const notRegistered =
        item.details?.error === DEVICE_NOT_REGISTERED ||
        Boolean(item.message?.includes(DEVICE_NOT_REGISTERED));
      return {
        sendId: m.sendId,
        deviceId: m.deviceId,
        ok: false,
        reason: item.message ?? item.details?.error ?? 'Bilinmeyen hata',
        deviceNotRegistered: notRegistered,
      };
    });
  }
}

export class PushProviderUnreachableError extends Error {}

export class SimulatedPushProvider implements PushProviderPort {
  readonly name = 'simulated' as const;

  /** Test/gözlem için gönderim kaydı (bellek içi). */
  readonly sent: PushMessage[] = [];

  constructor(
    /** Bu token'lar DeviceNotRegistered döner (temizlik akışı testi). */
    private readonly invalidTokens: ReadonlySet<string> = new Set(),
  ) {}

  async sendBatch(messages: PushMessage[]): Promise<PushTicket[]> {
    return messages.map((m) => {
      this.sent.push(m);
      // Belgelendi davranış: token'da "invalid" geçenler kayıtsız sayılır
      // (temizlik akışı dev/test'te uçtan uca denenebilir).
      if (
        this.invalidTokens.has(m.pushToken) ||
        m.pushToken.toLowerCase().includes('invalid')
      ) {
        return {
          sendId: m.sendId,
          deviceId: m.deviceId,
          ok: false,
          reason: `${DEVICE_NOT_REGISTERED}: token kayıtlı değil`,
          deviceNotRegistered: true,
        };
      }
      return { sendId: m.sendId, deviceId: m.deviceId, ok: true, ticketId: `sim-${this.sent.length}` };
    });
  }
}

export class NoopPushProvider implements PushProviderPort {
  readonly name = 'none' as const;

  async sendBatch(): Promise<PushTicket[]> {
    // Push devre dışı: gönderimler PENDING kalır (sahte başarı yok);
    // in-app bildirimler yine yazılır ve merkezde görünür.
    return [];
  }
}
