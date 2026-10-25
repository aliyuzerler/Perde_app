/**
 * Oynatma ilerlemesi — yerel, GERÇEK çalışan izleme geçmişi.
 * Dikey oynatıcı bu store'a pozisyon yazar; ana sayfanın "İzlemeye devam et"
 * rayı ve Planım > Geçmiş bölümü buradan beslenir. Sunucu eşitlemesi Faz 4'te
 * playback_sessions tablosuyla yapılacaktır (bkz. docs/ERD.md).
 */
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PlaybackEntry {
  contentId: string;
  contentTitle: string;
  episodeId: string;
  episodeTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  /** Son pozisyon (saniye). */
  positionSeconds: number;
  /** Bölüm süresi (saniye). */
  durationSeconds: number;
  verticalPreviewUrl?: string | null;
  posterUrl?: string | null;
  accessType: 'FREE' | 'SUBSCRIPTION' | 'CREDIT';
  updatedAt: number;
}

export interface PlaybackState {
  entries: Record<string, PlaybackEntry>;
  saveProgress: (entry: PlaybackEntry) => void;
  getProgress: (episodeId: string) => PlaybackEntry | undefined;
  /** Süre %90'ı geçen bölümler tamamlanmış sayılır. */
  completed: (episodeId: string) => boolean;
  /** En yeniye göre sıralı tamamlanmamış girişler. */
  continueWatching: () => PlaybackEntry[];
  /** En yeniye göre sıralı tüm girişler (geçmiş). */
  history: () => PlaybackEntry[];
  remove: (episodeId: string) => void;
  clear: () => void;
}

const COMPLETION_RATIO = 0.9;

const stateStorage: StateStorage = {
  getItem: async (name) => (await AsyncStorage.getItem(name)) ?? null,
  setItem: async (name, value) => {
    await AsyncStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    await AsyncStorage.removeItem(name);
  },
};

function sorted(entries: Record<string, PlaybackEntry>): PlaybackEntry[] {
  return Object.values(entries).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const usePlaybackStore = create<PlaybackState>()(
  persist(
    (set, get) => ({
      entries: {},
      saveProgress: (entry) =>
        set((state) => ({
          entries: {
            ...state.entries,
            [entry.episodeId]: { ...entry, updatedAt: Date.now() },
          },
        })),
      getProgress: (episodeId) => get().entries[episodeId],
      completed: (episodeId) => {
        const entry = get().entries[episodeId];
        if (!entry) return false;
        return entry.positionSeconds / entry.durationSeconds >= COMPLETION_RATIO;
      },
      continueWatching: () =>
        sorted(get().entries).filter(
          (entry) => entry.positionSeconds / entry.durationSeconds < COMPLETION_RATIO
        ),
      history: () => sorted(get().entries),
      remove: (episodeId) =>
        set((state) => {
          const next = { ...state.entries };
          delete next[episodeId];
          return { entries: next };
        }),
      clear: () => set({ entries: {} }),
    }),
    {
      name: 'perdego.playback.v1',
      storage: createJSONStorage(() => stateStorage),
    }
  )
);
