/**
 * Kullanıcı tercihleri (istemci durumu).
 * Sunucu durumu DEĞİLDİR; yalnızca oynatma/görüntüleme tercihlerini tutar.
 */
import { create } from 'zustand';
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupportedLocale } from '@perdego/contracts';

export interface PreferencesState {
  autoplayPreviews: boolean;
  dataSaver: boolean;
  locale: SupportedLocale;
  setAutoplayPreviews: (value: boolean) => void;
  setDataSaver: (value: boolean) => void;
  setLocale: (value: SupportedLocale) => void;
}

/** AsyncStorage, zustand'ın beklediği string tabanlı StateStorage sözleşmesine uyar. */
const stateStorage: StateStorage = {
  getItem: async (name) => (await AsyncStorage.getItem(name)) ?? null,
  setItem: async (name, value) => {
    await AsyncStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    await AsyncStorage.removeItem(name);
  },
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      autoplayPreviews: true,
      dataSaver: false,
      locale: 'tr',
      setAutoplayPreviews: (value) => set({ autoplayPreviews: value }),
      setDataSaver: (value) => set({ dataSaver: value }),
      setLocale: (value) => set({ locale: value }),
    }),
    {
      name: 'perdego.preferences.v1',
      storage: createJSONStorage(() => stateStorage),
    }
  )
);
