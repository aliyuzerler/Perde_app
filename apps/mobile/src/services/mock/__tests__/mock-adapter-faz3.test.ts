/**
 * Faz 3 mock adapter testleri — abonelik, kredi, hesap ve kategori akışları.
 * Mock yalnızca __DEV__'de çalışır; jest-expo ortamında __DEV__ true'dur.
 * Faz 3b ekleri: gerçek oturum sözleşmesi (token çifti), e-posta doğrulama
 * ve parola sıfırlama akışları mock kutu (outbox) üzerinden test edilir.
 */
import { describe, expect, it, beforeEach } from '@jest/globals';
import { createMockAdapter, getMockDevControls, resetMockAccountState } from '../mock-adapter';
import { mockOutbox, mockTransactionLog, mockWalletState, mockUsers } from '../mock-data';

const REGISTER_OK = {
  displayName: 'Test Kullanıcı',
  email: 'yeni-kullanici@ornek.com',
  password: 'parola1234',
  acceptTerms: true as const,
};

describe('Faz 3 mock adapter', () => {
  beforeEach(() => {
    getMockDevControls().failNextRequest = false;
    resetMockAccountState();
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

  // ---------------- Faz 3b: oturum + e-posta doğrulama ----------------

  it('doğrulanmış kullanıcı oturum açar: token çifti + emailVerified', async () => {
    const adapter = createMockAdapter();
    const session = await adapter.login({
      email: 'deniz@ornek.com',
      password: 'perdego1',
    });
    expect(session.user.email).toBe('deniz@ornek.com');
    expect(session.user.emailVerified).toBe(true);
    expect(session.tokens.accessToken).toContain('mock-access');
    expect(session.tokens.refreshToken).toContain('mock-refresh');
    expect(session.tokens.expiresIn).toBeGreaterThan(0);
  });

  it('hatalı şifrede reddeder', async () => {
    const adapter = createMockAdapter();
    await expect(
      adapter.login({ email: 'deniz@ornek.com', password: 'yanlis-parola' })
    ).rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('doğrulanmamış e-postada EMAIL_NOT_VERIFIED nedeni verir', async () => {
    const adapter = createMockAdapter();
    await adapter.register(REGISTER_OK);
    await expect(
      adapter.login({ email: REGISTER_OK.email, password: REGISTER_OK.password })
    ).rejects.toMatchObject({ reason: 'EMAIL_NOT_VERIFIED' });
  });

  it('kayıtta çakışan e-postayı EMAIL_ALREADY_EXISTS ile reddeder', async () => {
    const adapter = createMockAdapter();
    await expect(
      adapter.register({
        displayName: 'Deniz A.',
        email: 'deniz@ornek.com',
        password: 'perdego1',
        acceptTerms: true,
      })
    ).rejects.toMatchObject({ reason: 'EMAIL_ALREADY_EXISTS' });
  });

  it('kayıt doğrulama e-postası üretir; anahtar tüketilince hesap doğrulanır', async () => {
    const adapter = createMockAdapter();
    await adapter.register(REGISTER_OK);
    expect(mockOutbox).toHaveLength(1);
    expect(mockOutbox[0]!.subject).toContain('doğrulama');

    await adapter.verifyEmail(mockOutbox[0]!.token);
    const user = mockUsers.find((u) => u.email === REGISTER_OK.email);
    expect(user?.emailVerified).toBe(true);

    const session = await adapter.login({
      email: REGISTER_OK.email,
      password: REGISTER_OK.password,
    });
    expect(session.user.emailVerified).toBe(true);
  });

  it('geçersiz doğrulama anahtarı TOKEN_INVALID verir', async () => {
    const adapter = createMockAdapter();
    await expect(adapter.verifyEmail('olmayan-anahtar-degeri')).rejects.toMatchObject({
      reason: 'TOKEN_INVALID',
    });
  });

  it('parola sıfırlama akışı: e-posta → reset → yeni şifreyle giriş', async () => {
    const adapter = createMockAdapter();
    await adapter.forgotPassword('deniz@ornek.com');
    expect(mockOutbox).toHaveLength(1);
    expect(mockOutbox[0]!.subject).toContain('sıfırlama');

    await adapter.resetPassword(mockOutbox[0]!.token, 'yeni-parola-42');
    const session = await adapter.login({
      email: 'deniz@ornek.com',
      password: 'yeni-parola-42',
    });
    expect(session.user.email).toBe('deniz@ornek.com');
  });

  it('bilinmeyen e-postaya forgot-password daima olumlu döner (sayım engeli)', async () => {
    const adapter = createMockAdapter();
    const result = await adapter.forgotPassword('yok@ornek.com');
    expect(result.sent).toBe(true);
    expect(mockOutbox).toHaveLength(0);
  });

  it('şifre değiştirme mevcut şifre yanlışsa WRONG_PASSWORD verir', async () => {
    const adapter = createMockAdapter();
    await adapter.login({ email: 'deniz@ornek.com', password: 'perdego1' });
    await expect(
      adapter.changePassword('yanlis-mevcut', 'yeni-parola-42')
    ).rejects.toMatchObject({ reason: 'WRONG_PASSWORD' });
  });

  it('oturum listesi ve tüm cihazlardan çıkış çalışır', async () => {
    const adapter = createMockAdapter();
    await adapter.login({ email: 'deniz@ornek.com', password: 'perdego1' });
    const sessions = await adapter.getSessions();
    expect(sessions.items.length).toBeGreaterThan(0);

    const result = await adapter.logoutAll();
    expect(result.revoked).toBe(sessions.items.length);
  });

  it('hesap silme talebi şifre teyidi ister ve oturumu kapatır', async () => {
    const adapter = createMockAdapter();
    await adapter.login({ email: 'deniz@ornek.com', password: 'perdego1' });

    await expect(
      adapter.requestAccountDeletion('yanlis-sifre')
    ).rejects.toMatchObject({ reason: 'WRONG_PASSWORD' });

    const result = await adapter.requestAccountDeletion('perdego1');
    expect(result.purgeAt).toBeTruthy();
    const sessions = await adapter.getSessions();
    expect(sessions.items).toHaveLength(0);
  });

  it('yasal metinler sürüm bilgisiyle döner', async () => {
    const adapter = createMockAdapter();
    const terms = await adapter.getLegalDocument('terms');
    expect(terms.slug).toBe('terms');
    expect(terms.version).toBeTruthy();
    expect(terms.content.length).toBeGreaterThan(10);
  });

  it('kategori listesi ve kategori detayını sayfalı döner', async () => {
    const adapter = createMockAdapter();
    const list = await adapter.getCategories();
    expect(list.items.length).toBeGreaterThan(0);

    const detail = await adapter.getCategoryContent('dram', 1, 20);
    expect(detail.category.slug).toBe('dram');
    expect(detail.items.length).toBeGreaterThan(0);
    expect(detail.meta).toBeDefined();
    for (const item of detail.items) {
      expect(item.genres).toContain('dram');
    }
  });

  it('bilinmeyen kategoride hata verir', async () => {
    const adapter = createMockAdapter();
    await expect(adapter.getCategoryContent('yok-bole-tur', 1, 20)).rejects.toThrow(
      'NOT_FOUND'
    );
  });
});
