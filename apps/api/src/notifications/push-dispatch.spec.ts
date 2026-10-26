/**
 * PushDispatchService birim testleri (FAZ 9 QA).
 *
 * Kabul maddesi 8 (başarısız gönderim ve yeniden deneme) + 9 (gizlilik)
 * kapsamında servis davranışının otomatik kanıtı:
 *  - Sağlayıcı erişilemez → satırlar PENDING kalır, attempts artar
 *    (sonraki çevrimde yeniden denenir).
 *  - Kalıcı hata + MAX_ATTEMPTS → FAILED (sonsuz tekrar yok).
 *  - Bayat/geçersiz cihaz → sağlayıcı çağrılmadan FAILED (TOKEN_INVALID).
 *  - Bilet→satır eşleştirmesi sendId ile yapılır (F9-01 regresyonu:
 *    aynı cihaza giden farklı bildirimler karışmaz).
 *  - toPushMessage izin listesi: payload'a yalnız izinli derin bağlantı
 *    alanları girer; e-posta/ödeme/bilinmeyen alanlar bantlanır.
 */
import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env.schema';
import { PushDispatchService } from './push-dispatch.service';
import {
  PushProviderPort,
  PushProviderUnreachableError,
  type PushTicket,
} from './push.provider';

type UpdateRecord = { id: string; data: Record<string, unknown> };

function makeEnv(): Env {
  return {
    NODE_ENV: 'test',
    PUSH_PROVIDER: 'simulated',
    EXPO_PUSH_BASE_URL: 'https://exp.host',
    PUSH_DISPATCH_INTERVAL_MS: 60_000,
    PUSH_SWEEP_INTERVAL_MS: 60_000,
    PUSH_INVALID_TOKEN_TTL_DAYS: 7,
    SUB_REMINDER_DAYS: 3,
  } as unknown as Env;
}

interface SendRowOverrides {
  id?: string;
  invalidAt?: Date | null;
  locale?: string;
  attemptsOf?: number;
}

function makeService(rows: Array<Record<string, unknown>>, overrides: SendRowOverrides = {}) {
  const updates: UpdateRecord[] = [];
  const prisma = {
    notificationSend: {
      findMany: async () => rows,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, data });
        return {};
      },
      findUnique: async (_args: { where: { id: string } }) => ({
        attempts: overrides.attemptsOf ?? 0,
      }),
    },
    notification: { updateMany: async () => ({ count: 1 }) },
    device: { update: async () => ({}) },
  } as unknown as PrismaService;
  const push = new PushDispatchService(prisma, makeEnv());
  return { push, updates };
}

function row(overrides: SendRowOverrides = {}) {
  return {
    id: overrides.id ?? 'send_1',
    status: 'PENDING' as const,
    createdAt: new Date(),
    notification: {
      id: 'n1',
      titleTr: 'Başlık TR',
      titleEn: 'Title EN',
      bodyTr: 'Gövde TR',
      bodyEn: 'Body EN',
      dataJson: { kind: 'EPISODE', contentId: 'c1', episodeId: 'e1' },
    },
    device: {
      id: 'dev_1',
      pushToken: 'ExponentPushToken[valid-token-01]',
      locale: overrides.locale ?? 'tr',
      invalidAt: overrides.invalidAt ?? null,
    },
  };
}

function stubProvider(
  name: 'simulated' = 'simulated',
  sendBatch: PushProviderPort['sendBatch'],
): PushProviderPort {
  return { name, sendBatch };
}

describe('PushDispatchService.dispatchPending — başarısız gönderim ve yeniden deneme', () => {
  it('sağlayıcı erişilemez → PENDING kalır, attempts artar (retry yolu)', async () => {
    const { push, updates } = makeService([row()]);
    (push as unknown as { provider: PushProviderPort }).provider = stubProvider(
      'simulated',
      async () => {
        throw new PushProviderUnreachableError('Expo push HTTP 503');
      },
    );
    const result = await push.dispatchPending();
    expect(result).toEqual({ tried: 1, sent: 0, failed: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.data.attempts).toEqual({ increment: 1 });
    expect(updates[0]!.data.lastError).toBe('PROVIDER_UNREACHABLE');
    // PENDING korunur: status set EDİLMEMİŞ.
    expect(updates[0]!.data.status).toBeUndefined();
  });

  it('kalıcı hata + MAX_ATTEMPTS dolunca FAILED (sonsuz tekrar yok)', async () => {
    const { push, updates } = makeService([row()], { attemptsOf: 4 });
    (push as unknown as { provider: PushProviderPort }).provider = stubProvider(
      'simulated',
      async () => {
        throw new Error('mesaj formatı reddedildi');
      },
    );
    await push.dispatchPending();
    expect(updates).toHaveLength(1);
    expect(updates[0]!.data.status).toBe('FAILED');
    expect(String(updates[0]!.data.lastError)).toContain('mesaj formatı');
  });

  it('bayat/geçersiz cihaz sağlayıcı çağrılmadan FAILED (TOKEN_INVALID) olur', async () => {
    const { push, updates } = makeService([row({ invalidAt: new Date() })]);
    (push as unknown as { provider: PushProviderPort }).provider = stubProvider(
      'simulated',
      async () => {
        throw new Error('SAĞLAYICI ÇAĞRILMAMALIYDI');
      },
    );
    const result = await push.dispatchPending();
    expect(result).toEqual({ tried: 1, sent: 0, failed: 1 });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.data.status).toBe('FAILED');
    expect(updates[0]!.data.lastError).toBe('TOKEN_INVALID');
  });

  it('biletler sendId ile eşlenir — aynı cihaza giden iki bildirim karışmaz (F9-01 regresyonu)', async () => {
    const r1 = row({ id: 'send_A' });
    const r2 = row({ id: 'send_B' }); // AYNI cihaz (deviceId dev_1)
    const { push, updates } = makeService([r1, r2]);
    const tickets: PushTicket[] = [
      { sendId: 'send_A', deviceId: 'dev_1', ok: true, ticketId: 'ticket-A' },
      { sendId: 'send_B', deviceId: 'dev_1', ok: true, ticketId: 'ticket-B' },
    ];
    (push as unknown as { provider: PushProviderPort }).provider = stubProvider(
      'simulated',
      async () => tickets,
    );
    const result = await push.dispatchPending();
    expect(result).toEqual({ tried: 2, sent: 2, failed: 0 });
    const byId = new Map(updates.map((u) => [u.id, u.data]));
    expect(byId.get('send_A')!.ticketId).toBe('ticket-A');
    expect(byId.get('send_B')!.ticketId).toBe('ticket-B');
    expect(byId.get('send_A')!.status).toBe('SENT');
    expect(byId.get('send_B')!.status).toBe('SENT');
  });

  it('bilinmeyen sendId’li bilet sessizce atlanır (yanlış satır güncellenmez)', async () => {
    const { push, updates } = makeService([row({ id: 'send_A' })]);
    (push as unknown as { provider: PushProviderPort }).provider = stubProvider(
      'simulated',
      async () => [
        { sendId: 'yabancı-send', deviceId: 'dev_1', ok: true, ticketId: 't' },
      ],
    );
    const result = await push.dispatchPending();
    expect(result.sent).toBe(0);
    expect(updates).toHaveLength(0);
  });
});

describe('PushDispatchService.toPushMessage — payload izin listesi (gizlilik)', () => {
  it('izin listesi dışı alanları bantlar (e-posta/IBAN/tutar/bilinmeyen)', () => {
    const { push } = makeService([]);
    const message = push.toPushMessage(
      {
        titleTr: 'Satın alım tamamlandı',
        titleEn: 'Purchase completed',
        bodyTr: 'Kredi paketin eklendi.',
        bodyEn: 'Pack added.',
        dataJson: {
          kind: 'BILLING',
          contentId: 'c1',
          episodeId: 'e1',
          email: 'kurban@ornek.com',
          iban: 'TR9900000000000000',
          amount: 4990,
          cardLast4: '4242',
          sessionToken: 'gizli',
        },
      },
      { id: 'dev_1', pushToken: 'ExponentPushToken[t]', locale: 'tr' },
      'send_1',
    );
    expect(message.data).toEqual({ kind: 'BILLING', contentId: 'c1', episodeId: 'e1' });
    expect(JSON.stringify(message.data)).not.toContain('kurban');
    expect(JSON.stringify(message.data)).not.toContain('4242');
  });

  it('64 karakterden uzun değerler ve sayısal/dizi türleri bantlanır', () => {
    const { push } = makeService([]);
    const message = push.toPushMessage(
      {
        titleTr: 'T',
        titleEn: 'T',
        bodyTr: 'B',
        bodyEn: 'B',
        dataJson: {
          kind: 'EPISODE',
          contentId: 'x'.repeat(80),
          campaignId: 12345,
        },
      },
      { id: 'dev_1', pushToken: 'ExponentPushToken[t]', locale: 'en' },
      'send_1',
    );
    expect(message.data).toEqual({ kind: 'EPISODE' });
  });

  it('dil seçimi cihaz locale’ine göre yapılır ve metinler kırpılır', () => {
    const { push } = makeService([]);
    const longTitle = 'B'.repeat(300);
    const longBody = 'K'.repeat(500);
    const tr = push.toPushMessage(
      { titleTr: longTitle, titleEn: 'EN başlık', bodyTr: longBody, bodyEn: 'EN gövde', dataJson: null },
      { id: 'dev_1', pushToken: 't', locale: 'tr' },
      'send_1',
    );
    expect(tr.title).toBe('B'.repeat(120));
    expect(tr.body).toBe('K'.repeat(200));
    const en = push.toPushMessage(
      { titleTr: 'TR başlık', titleEn: 'EN başlık', bodyTr: 'TR gövde', bodyEn: 'EN gövde', dataJson: null },
      { id: 'dev_1', pushToken: 't', locale: 'en' },
      'send_1',
    );
    expect(en.title).toBe('EN başlık');
    expect(en.body).toBe('EN gövde');
  });
});
