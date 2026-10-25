/**
 * Oturum durumu — Faz 3b gerçek oturum.
 *
 * - Oturum verisi (user + token çifti) secure-storage (Keychain/Keystore)
 *   ile saklanır; AsyncStorage artık token taşımaz (Teknik Kural 3).
 * - `clearSession()` 401→refresh akışı api-client tarafından çağrılır ve
 *   `onSessionExpired` aboneleri kök layout'ta güvenli yönlendirme yapar
 *   (Mobil kural: oturum süresi dolduğunda güvenli yönlendirme).
 * - Persist sürümü 2: v1 mock oturumları (sessionToken şemalı) migrate
 *   sırasında düşürülür — bayat mock oturum gerçek API'ye sızamaz.
 */
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { secureStorage } from '@/services/secure-storage';
import type { AuthSession } from '@perdego/contracts';

export interface AuthState {
  session: AuthSession | null;
  setSession: (session: AuthSession | null) => void;
  /** Profil güncellemesi sonrası kullanıcı alanlarını tazele. */
  updateUser: (user: Partial<AuthSession['user']>) => void;
  clearSession: () => void;
  /** Oturum açık mı? */
  isAuthenticated: () => boolean;
  /** Görüntülenecek ad (oturum yoksa "Misafir" akışı ekran tarafındadır). */
  displayName: () => string | null;
  getRefreshToken: () => string | null;
  getAccessToken: () => string | null;
}

type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();

/** Oturum sunucu tarafından öldüğünde (refresh reddi) tetiklenir. */
export function onSessionExpired(listener: Listener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}
function emitSessionExpired(): void {
  for (const listener of sessionExpiredListeners) {
    listener();
  }
}

const stateStorage: StateStorage = {
  getItem: (name) => secureStorage.getItem(name),
  setItem: (name, value) => secureStorage.setItem(name, value),
  removeItem: (name) => secureStorage.removeItem(name),
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      setSession: (session) => set({ session }),
      updateUser: (user) =>
        set((state) =>
          state.session
            ? { session: { ...state.session, user: { ...state.session.user, ...user } } }
            : state,
        ),
      clearSession: () => {
        set({ session: null });
        emitSessionExpired();
      },
      isAuthenticated: () => get().session !== null,
      displayName: () => get().session?.user.displayName ?? null,
      getAccessToken: () => get().session?.tokens.accessToken ?? null,
      getRefreshToken: () => get().session?.tokens.refreshToken ?? null,
    }),
    {
      name: 'perdego.auth.v2',
      storage: createJSONStorage(() => stateStorage),
      version: 2,
      /** v1 mock oturumları (sessionToken) güvenli şekilde yok sayılır. */
      migrate: (persisted, version) => {
        if (version !== 2) return { session: null };
        return persisted as { session: AuthSession | null };
      },
    }
  )
);
