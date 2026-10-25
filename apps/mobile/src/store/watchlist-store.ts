/**
 * Planım (izleme listesi) — yerel istemci durumu.
 * Faz 3-5'te sunucu tarafı listeyle eşitlenecektir; şimdilik cihaz bazlıdır.
 * Bu, üretimde tam işlevsel bir yerel özelliktir; sahte bir "tamamlandı"
 * izlenimi vermez (Genel Kural 9).
 */
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ContentSummary } from '@perdego/contracts';

export interface WatchlistState {
  items: ContentSummary[];
  add: (item: ContentSummary) => void;
  remove: (contentId: string) => void;
  has: (contentId: string) => boolean;
  clear: () => void;
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

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((state) =>
          state.items.some((entry) => entry.contentId === item.contentId)
            ? state
            : { items: [item, ...state.items] }
        ),
      remove: (contentId) =>
        set((state) => ({
          items: state.items.filter((entry) => entry.contentId !== contentId),
        })),
      has: (contentId) =>
        get().items.some((entry) => entry.contentId === contentId),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'perdego.watchlist.v1',
      storage: createJSONStorage(() => stateStorage),
    }
  )
);
