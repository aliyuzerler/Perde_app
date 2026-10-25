/**
 * auth-store testleri — mock oturum bilinci.
 */
import { describe, expect, it, beforeEach } from '@jest/globals';
import { useAuthStore } from '../auth-store';
import type { AuthSession } from '@perdego/contracts';

const session: AuthSession = {
  user: {
    id: 'u_test',
    displayName: 'Deniz Aksoy',
    email: 'deniz@ornek.com',
    joinedAt: '2025-03-14T10:00:00.000Z',
  },
  sessionToken: 'mock-session-test',
};

describe('auth-store', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession(null);
  });

  it('varsayılan durum misafirdir', () => {
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.isAuthenticated()).toBe(false);
    expect(state.displayName()).toBeNull();
  });

  it('oturum açılınca kullanıcı bilgisi görünür', () => {
    useAuthStore.getState().setSession(session);
    const state = useAuthStore.getState();
    expect(state.isAuthenticated()).toBe(true);
    expect(state.displayName()).toBe('Deniz Aksoy');
  });

  it('çıkış oturumu temizler', () => {
    useAuthStore.getState().setSession(session);
    useAuthStore.getState().setSession(null);
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });
});
