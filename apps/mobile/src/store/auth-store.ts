/**
 * Oturum durumu — Faz 3 mock oturum.
 * Oturum verisi yalnızca mock adapter'dan gelir (misafir varsayılandır);
 * gerçek kimlik doğrulama Faz 3 sunucu tarafında SecureStore + JWT ile
 * değiştirilecektir. Bu store yalnızca görüntülenen oturum bilinçini tutar.
 */
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthSession } from '@perdego/contracts';

export interface AuthState {
  session: AuthSession | null;
  setSession: (session: AuthSession | null) => void;
  /** Oturum açık mı? */
  isAuthenticated: () => boolean;
  /** Görüntülenecek ad (oturum yoksa "Misafir" akışı ekran tarafındadır). */
  displayName: () => string | null;
}

const stateStorage: StateStorage = {
  getItem: async (name) => (await AsyncStorage.getItem(name)) ?? null,
  setItem: async (name, value) => {
    await AsyncStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    await AsyncStorage.removeItem(name);
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      setSession: (session) => set({ session }),
      isAuthenticated: () => get().session !== null,
      displayName: () => get().session?.user.displayName ?? null,
    }),
    {
      name: 'perdego.auth.v1',
      storage: createJSONStorage(() => stateStorage),
    }
  )
);
