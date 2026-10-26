/**
 * Push sağlayıcı birim testleri (FAZ 9 QA).
 *
 * Kabul maddesi 8 (başarısız gönderim/yeniden deneme) ve 9 (gizlilik)
 * kapsamında sağlayıcı davranışının otomatik kanıtı:
 *  - ExpoPushProvider: 100'lük parçalama, bilet→gönderim satırı eşleştirmesi,
 *    DeviceNotRegistered algılama, erişilemezlik hatası (retryable).
 *  - SimulatedPushProvider: belgelenmiş 'invalid' token reddi.
 *  - NoopPushProvider: sahte başarı yok (boş bilet).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ExpoPushProvider,
  NoopPushProvider,
  PushProviderUnreachableError,
  SimulatedPushProvider,
  type PushMessage,
} from './push.provider';

function msg(overrides: Partial<PushMessage> = {}): PushMessage {
  return {
    sendId: 'send_1',
    deviceId: 'dev_1',
    pushToken: 'ExponentPushToken[valid-token-01]',
    title: 'Başlık',
    body: 'Gövde',
    data: { kind: 'EPISODE', episodeId: 'e1' },
    ...overrides,
  };
}

function jsonResponse(payload: unknown, ok = true): Response {
  return { ok, json: async () => payload } as unknown as Response;
}

describe('ExpoPushProvider — parçalama ve bilet eşleştirme', () => {
  it('250 mesaj 3 isteğe bölünür (100/100/50) ve doğru alana gönderilir', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Array<{ to: string }>;
        return jsonResponse({ data: body.map(() => ({ status: 'ok', id: 't' })) });
      });
    const provider = new ExpoPushProvider('https://exp.host', fetchImpl as typeof fetch);
    const messages = Array.from({ length: 250 }, (_, i) =>
      msg({ sendId: `s${i}`, pushToken: `ExponentPushToken[tok-${i}]` }),
    );
    const tickets = await provider.sendBatch(messages);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(tickets).toHaveLength(250);
    // Biletler gönderim sırasına göre döner.
    expect(tickets[0]!.sendId).toBe('s0');
    expect(tickets[249]!.sendId).toBe('s249');
    expect(tickets.every((t) => t.ok)).toBe(true);
  });

  it('biletler sendId ile eşleşir (F9-01 korelasyon sözleşmesi)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { status: 'ok', id: 'ticket-A' },
          { status: 'ok', id: 'ticket-B' },
        ],
      }),
    );
    const provider = new ExpoPushProvider('https://exp.host', fetchImpl as typeof fetch);
    const tickets = await provider.sendBatch([
      msg({ sendId: 'send_A' }),
      msg({ sendId: 'send_B' }),
    ]);
    expect(tickets[0]).toMatchObject({ sendId: 'send_A', ok: true, ticketId: 'ticket-A' });
    expect(tickets[1]).toMatchObject({ sendId: 'send_B', ok: true, ticketId: 'ticket-B' });
  });

  it('DeviceNotRegistered hem details.error hem mesaj metninden algılanır', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } },
          { status: 'error', message: 'DeviceNotRegistered: token kayıtlı değil' },
          { status: 'error', message: 'MessageTooBig' },
        ],
      }),
    );
    const provider = new ExpoPushProvider('https://exp.host', fetchImpl as typeof fetch);
    const tickets = await provider.sendBatch([msg(), msg(), msg()]);
    expect(tickets[0]!.deviceNotRegistered).toBe(true);
    expect(tickets[1]!.deviceNotRegistered).toBe(true);
    expect(tickets[2]!.deviceNotRegistered).toBe(false);
    expect(tickets[2]!.ok).toBe(false);
  });

  it('yanıtta bilet eksikse dürüst hata döner (sahte başarı yok)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const provider = new ExpoPushProvider('https://exp.host', fetchImpl as typeof fetch);
    const tickets = await provider.sendBatch([msg()]);
    expect(tickets[0]!.ok).toBe(false);
    expect(tickets[0]!.reason).toContain('eksik');
  });

  it('HTTP hatası PushProviderUnreachableError fırlatır (dispatch PENDING bırakır)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false));
    const provider = new ExpoPushProvider('https://exp.host', fetchImpl as typeof fetch);
    await expect(provider.sendBatch([msg()])).rejects.toBeInstanceOf(
      PushProviderUnreachableError,
    );
  });

  it('ağ hatası PushProviderUnreachableError fırlatır', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = new ExpoPushProvider('https://exp.host', fetchImpl as typeof fetch);
    await expect(provider.sendBatch([msg()])).rejects.toBeInstanceOf(
      PushProviderUnreachableError,
    );
  });
});

describe('SimulatedPushProvider / NoopPushProvider', () => {
  it('geçerli token ok bileti üretir; invalid token DeviceNotRegistered döner', async () => {
    const provider = new SimulatedPushProvider();
    const tickets = await provider.sendBatch([
      msg({ sendId: 's_ok', pushToken: 'ExponentPushToken[good]' }),
      msg({ sendId: 's_bad', pushToken: 'ExponentPushToken[invalid-qa9-x]' }),
    ]);
    expect(tickets[0]!.ok).toBe(true);
    expect(tickets[0]!.ticketId).toBeDefined();
    expect(tickets[1]!.ok).toBe(false);
    expect(tickets[1]!.deviceNotRegistered).toBe(true);
    expect(provider.sent).toHaveLength(2);
  });

  it('Noop sağlayıcı boş bilet döner (gönderimler PENDING kalır)', async () => {
    const provider = new NoopPushProvider();
    expect(provider.name).toBe('none');
    await expect(provider.sendBatch()).resolves.toEqual([]);
  });
});
