/**
 * auth-store testleri — Faz 3b gerçek oturum bilinci.
 * Kapsam: token çifti taşıma, updateUser, clearSession + onSessionExpired
 * olayı (api-client refresh reddi → güvenli yönlendirme zinciri).
 */
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { useAuthStore, onSessionExpired } from '../auth-store';
import type { AuthSession } from '@perdego/contracts';

const session: AuthSession = {
  user: {
    id: 'u_test',
    displayName: 'Deniz Aksoy',
    email: 'deniz@ornek.com',
    locale: 'tr',
    role: 'USER',
    joinedAt: '2025-03-14T10:00:00.000Z',
    emailVerified: true,
  },
  tokens: {
    accessToken: 'access-token-test',
    refreshToken: 'refresh-token-test',
    expiresIn: 900,
  },
};

const unverifiedSession: AuthSession = {
  ...session,
  user: { ...session.user, emailVerified: false },
};

describe('auth-store', () => {
  const unsubscribers: (() => void)[] = [];

  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  afterEach(() => {
    for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
  });

  it('varsayılan durum misafirdir', () => {
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.isAuthenticated()).toBe(false);
    expect(state.displayName()).toBeNull();
    expect(state.getAccessToken()).toBeNull();
    expect(state.getRefreshToken()).toBeNull();
  });

  it('oturum açılınca kullanıcı ve token erişimi görünür', () => {
    useAuthStore.getState().setSession(session);
    const state = useAuthStore.getState();
    expect(state.isAuthenticated()).toBe(true);
    expect(state.displayName()).toBe('Deniz Aksoy');
    expect(state.getAccessToken()).toBe('access-token-test');
    expect(state.getRefreshToken()).toBe('refresh-token-test');
  });

  it('updateUser seçili alanları tazeler', () => {
    useAuthStore.getState().setSession(unverifiedSession);
    useAuthStore.getState().updateUser({ displayName: 'Deniz A.', emailVerified: true });
    const updated = useAuthStore.getState().session;
    expect(updated?.user.displayName).toBe('Deniz A.');
    expect(updated?.user.emailVerified).toBe(true);
    expect(updated?.user.email).toBe('deniz@ornek.com');
  });

  it('clearSession + onSessionExpired olayı bir kez tetiklenir', () => {
    let fired = 0;
    unsubscribers.push(
      onSessionExpired(() => {
        fired += 1;
      })
    );

    useAuthStore.getState().setSession(session);
    useAuthStore.getState().clearSession();

    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
    expect(fired).toBe(1);
  });

  it('setSession(null) olayı tetiklemez (çıkış ≠ oturum bitişi)', () => {
    let fired = 0;
    unsubscribers.push(
      onSessionExpired(() => {
        fired += 1;
      })
    );

    useAuthStore.getState().setSession(session);
    useAuthStore.getState().setSession(null);
    expect(fired).toBe(0);
  });
});
