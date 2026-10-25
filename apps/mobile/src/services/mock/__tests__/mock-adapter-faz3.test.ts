/**
 * Faz 3 mock adapter testleri — abonelik, kredi, hesap ve kategori akışları.
 * Mock yalnızca __DEV__'de çalışır; jest-expo ortamında __DEV__ true'dur.
 */
import { describe, expect, it, beforeEach } from '@jest/globals';
import { createMockAdapter, getMockDevControls } from '../mock-adapter';
import { mockWalletState, mockTransactionLog } from '../mock-data';

describe('Faz 3 mock adapter', () => {
  beforeEach(() => {
    getMockDevControls().failNextRequest = false;
  });

  it('abonelik planlarını döner ve en avantajlı plan işaretlidir', async () => {
    const adapter = createMockAdapter();
    const result = await adapter.getSubscriptionPlans();
    expect(result.plans.length).toBeGreaterThanOrEqual(3);
    expect(result.plans.filter((plan) => plan.isBestValue).length).toBe(1);
    expect(result.plans[0]!.currency).toBe('TRY');
  });

  it('kredi paketlerini döner', async () => {
    const adapter = createMockAdapter();
    const result = await adapter.getCreditPacks();
    expect(result.packs.length).toBeGreaterThanOrEqual(3);
    for (const pack of result.packs) {
      expect(pack.credits).toBeGreaterThan(0);
      expect(pack.priceKurus).toBeGreaterThan(0);
    }
  });

  it('cüzdan bakiyesi ve purchased/granted kırılımını verir', async () => {
    const adapter = createMockAdapter();
    const result = await adapter.getWallet();
    expect(result.wallet.creditBalance).toBe(
      result.wallet.purchasedCredits + result.wallet.grantedCredits
    );
  });

  it('kredi satın alma bakiyeyi artırır ve hareket işler', async () => {
    const adapter = createMockAdapter();
    const before = await adapter.getWallet();
    const beforeBalance = before.wallet.creditBalance;
    const beforeTx = mockTransactionLog.length;

    const after = await adapter.purchaseCredits('pack_60');
    expect(after.wallet.creditBalance).toBe(beforeBalance + 60);
    expect(mockWalletState.purchasedCredits).toBeGreaterThan(
      before.wallet.purchasedCredits
    );
    expect(mockTransactionLog.length).toBe(beforeTx + 1);
  });

  it('bilinmeyen pakette 404 benzeri hata verir', async () => {
    const adapter = createMockAdapter();
    await expect(adapter.purchaseCredits('yok_boyle_paket')).rejects.toThrow(
      'NOT_FOUND'
    );
  });

  it('subscribe abonelik durumunu ACTIVE yapar', async () => {
    const adapter = createMockAdapter();
    const result = await adapter.subscribe('plan_yearly');
    expect(result.wallet.subscriptionStatus).toBe('ACTIVE');
    expect(result.wallet.subscriptionRenewsAt).toBeTruthy();
  });

  it('geçerli kimlik bilgisiyle oturum açar', async () => {
    const adapter = createMockAdapter();
    const session = await adapter.login({
      email: 'deniz@ornek.com',
      password: 'perdego',
    });
    expect(session.user.email).toBe('deniz@ornek.com');
    expect(session.sessionToken).toContain('mock-session');
  });

  it('hatalı şifrede reddeder', async () => {
    const adapter = createMockAdapter();
    await expect(
      adapter.login({ email: 'deniz@ornek.com', password: 'yanlis' })
    ).rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('kayıtta çakışan e-postayı reddeder', async () => {
    const adapter = createMockAdapter();
    await expect(
      adapter.register({
        displayName: 'Deniz A.',
        email: 'deniz@ornek.com',
        password: 'perdego',
        acceptTerms: true,
      })
    ).rejects.toThrow('EMAIL_IN_USE');
  });

  it('kategori listesi ve kategori detayını döner', async () => {
    const adapter = createMockAdapter();
    const list = await adapter.getCategories();
    expect(list.items.length).toBeGreaterThan(0);

    const detail = await adapter.getCategoryContent('dram');
    expect(detail.category.slug).toBe('dram');
    expect(detail.items.length).toBeGreaterThan(0);
    for (const item of detail.items) {
      expect(item.genres).toContain('dram');
    }
  });

  it('bilinmeyen kategoride hata verir', async () => {
    const adapter = createMockAdapter();
    await expect(adapter.getCategoryContent('yok-bole-tur')).rejects.toThrow(
      'NOT_FOUND'
    );
  });
});
