/**
 * FAZ 8 yönetim sözleşmesi testleri — admin paneli gerçek backend şemaları.
 *
 * Amaç: panelin kullandığı her yeni gövde/yanıt şemasının Zod doğrulamasını
 * sözleşme düzeyinde sabitlemek (istemci ve sunucu aynı kuralları paylaşır).
 */
import { describe, expect, it } from 'vitest';
import {
  adminCampaignInputSchema,
  adminCreditPackUpdateSchema,
  adminDashboardSchema,
  adminEpisodeInputSchema,
  adminEpisodeStatusChangeSchema,
  adminEpisodeUpdateSchema,
  adminPlanUpdateSchema,
  adminSeasonInputSchema,
  adminStoreTransactionListParamsSchema,
  adminTitleUpdateSchema,
  adminUserStatusUpdateSchema,
  adminUserRoleUpdateSchema,
  stepUpRequestSchema,
} from '../admin';

describe('FAZ 8 — admin title update', () => {
  it('kısmi güncellemeyi kabul eder', () => {
    const parsed = adminTitleUpdateSchema.parse({ titleTr: 'Yeni Başlık' });
    expect(parsed.titleTr).toBe('Yeni Başlık');
  });

  it('poster alanını null yapmaya izin verir', () => {
    expect(adminTitleUpdateSchema.parse({ posterUrl: null }).posterUrl).toBeNull();
  });

  it('geçersiz poster URL’ini reddeder', () => {
    expect(() => adminTitleUpdateSchema.parse({ posterUrl: 'not-a-url' })).toThrow();
  });
});

describe('FAZ 8 — sezon/bölüm sözleşmeleri', () => {
  it('sezon girdisini doğrular', () => {
    expect(adminSeasonInputSchema.parse({ seasonNumber: 1 }).seasonNumber).toBe(1);
    expect(() => adminSeasonInputSchema.parse({ seasonNumber: 0 })).toThrow();
  });

  it('FREE bölümünde creditCost zorunlu değildir', () => {
    const parsed = adminEpisodeInputSchema.parse({
      seasonNumber: 1,
      episodeNumber: 1,
      titleTr: 'Bölüm',
      titleEn: 'Episode',
      durationSeconds: 600,
    });
    expect(parsed.accessType).toBe('FREE');
    expect(parsed.creditCost).toBeUndefined();
  });

  it('CREDIT bölümünde creditCost zorunludur', () => {
    expect(() =>
      adminEpisodeInputSchema.parse({
        seasonNumber: 1,
        episodeNumber: 1,
        titleTr: 'Bölüm',
        titleEn: 'Episode',
        durationSeconds: 600,
        accessType: 'CREDIT',
      }),
    ).toThrow();

    expect(
      adminEpisodeInputSchema.parse({
        seasonNumber: 1,
        episodeNumber: 1,
        titleTr: 'Bölüm',
        titleEn: 'Episode',
        durationSeconds: 600,
        accessType: 'CREDIT',
        creditCost: 25,
      }).creditCost,
    ).toBe(25);
  });

  it('bölüm güncellemede CREDIT + creditCost=0 reddedilir', () => {
    expect(() =>
      adminEpisodeUpdateSchema.parse({ accessType: 'CREDIT', creditCost: 0 }),
    ).toThrow();
    expect(() => adminEpisodeUpdateSchema.parse({ titleTr: 'ok' })).not.toThrow();
  });

  it('bölüm durum geçişi yalnızca tanımlı değerleri kabul eder', () => {
    expect(adminEpisodeStatusChangeSchema.parse({ status: 'PUBLISHED' }).status).toBe('PUBLISHED');
    expect(() => adminEpisodeStatusChangeSchema.parse({ status: 'NOPE' })).toThrow();
  });
});

describe('FAZ 8 — gelir modeli sözleşmeleri', () => {
  it('plan güncellemesinde fiyat kuruş cinsinden tam sayıdır', () => {
    expect(adminPlanUpdateSchema.parse({ priceKurus: 4990 }).priceKurus).toBe(4990);
    expect(() => adminPlanUpdateSchema.parse({ priceKurus: -1 })).toThrow();
    expect(() => adminPlanUpdateSchema.parse({ currency: 'TRYX' })).toThrow();
  });

  it('kredi paketi güncellemesi ürün kimliklerini kabul eder', () => {
    const parsed = adminCreditPackUpdateSchema.parse({
      platformProductIdIos: 'pack10_ios',
      platformProductIdAndroid: 'pack10_android',
      priceKurus: 2990,
      isActive: false,
    });
    expect(parsed.platformProductIdIos).toBe('pack10_ios');
    expect(parsed.isActive).toBe(false);
  });

  it('mağaza işlem listesi filtrelerini doğrular', () => {
    const parsed = adminStoreTransactionListParamsSchema.parse({
      page: '2',
      pageSize: '10',
      state: 'REFUNDED',
      productType: 'CREDIT_PACK',
    });
    expect(parsed.page).toBe(2);
    expect(parsed.state).toBe('REFUNDED');
    expect(() =>
      adminStoreTransactionListParamsSchema.parse({ state: 'UNKNOWN' }),
    ).toThrow();
  });
});

describe('FAZ 8 — kullanıcı yönetimi sözleşmeleri', () => {
  it('durum güncellemesi yalnızca ACTIVE/SUSPENDED kabul eder', () => {
    expect(adminUserStatusUpdateSchema.parse({ status: 'SUSPENDED' }).status).toBe('SUSPENDED');
    expect(() => adminUserStatusUpdateSchema.parse({ status: 'DELETED' })).toThrow();
  });

  it('rol güncellemesi USER/EDITOR/ADMIN ile sınırlıdır', () => {
    expect(adminUserRoleUpdateSchema.parse({ role: 'EDITOR' }).role).toBe('EDITOR');
    expect(() => adminUserRoleUpdateSchema.parse({ role: 'SUPERUSER' })).toThrow();
  });
});

describe('FAZ 8 — bildirim kampanyası sözleşmesi', () => {
  it('derhal gönderim (scheduledFor boş) kabul edilir', () => {
    const parsed = adminCampaignInputSchema.parse({
      type: 'NEW_EPISODE',
      titleTr: 'Yeni bölüm',
      titleEn: 'New episode',
      bodyTr: 'Yeni bölüm yayında!',
      bodyEn: 'New episode is live!',
    });
    expect(parsed.scheduledFor).toBeUndefined();
  });

  it('planlanmış gönderim ISO datetime ister', () => {
    expect(
      adminCampaignInputSchema.parse({
        type: 'PROMO',
        titleTr: 't',
        titleEn: 't',
        bodyTr: 'b',
        bodyEn: 'b',
        scheduledFor: '2026-11-01T09:00:00.000Z',
      }).scheduledFor,
    ).toBe('2026-11-01T09:00:00.000Z');
    expect(() =>
      adminCampaignInputSchema.parse({
        type: 'PROMO',
        titleTr: 't',
        titleEn: 't',
        bodyTr: 'b',
        bodyEn: 'b',
        scheduledFor: 'yarın',
      }),
    ).toThrow();
  });
});

describe('FAZ 8 — dashboard ve step-up sözleşmeleri', () => {
  it('dashboard yükünü doğrular', () => {
    const payload = {
      range: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z' },
      users: { total: 10, active: 8, suspended: 1, newInRange: 3 },
      subscriptions: { active: 2, trialing: 1, canceled: 1, expired: 0, gracePeriod: 0 },
      catalog: {
        publishedTitles: 5,
        draftTitles: 2,
        processingTitles: 0,
        archivedTitles: 0,
        totalEpisodes: 13,
        publishedEpisodes: 11,
      },
      purchases: {
        inRangeCount: 4,
        inRangeRevenueKurus: 19960,
        totalCount: 4,
        totalRevenueKurus: 19960,
        refundCount: 0,
        refundedAmountKurus: 0,
        subscriptionCount: 1,
        creditPackCount: 3,
      },
      credits: {
        grantedInRange: 50,
        purchasedInRange: 120,
        spentInRange: 75,
        refundAdjustInRange: 0,
        balancePurchased: 200,
        balanceGranted: 100,
      },
      series: [{ day: '2026-10-01', signups: 1, revenueKurus: 4990, unlocks: 2 }],
      recentAudit: [
        {
          id: 'a1',
          actorUserId: 'u1',
          action: 'CONTENT_PUBLISH',
          entityType: 'content',
          entityId: 'c1',
          createdAt: '2026-10-02T10:00:00.000Z',
        },
      ],
      generatedAt: '2026-10-31T12:00:00.000Z',
    };
    expect(adminDashboardSchema.parse(payload).users.total).toBe(10);
  });

  it('step-up gövdesi boş şifreyi reddeder', () => {
    expect(stepUpRequestSchema.parse({ password: 'x' }).password).toBe('x');
    expect(() => stepUpRequestSchema.parse({ password: '' })).toThrow();
  });
});
