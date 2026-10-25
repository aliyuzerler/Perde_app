/**
 * playback-store testleri — gerçek yerel izleme ilerlemesi davranışı.
 */
import { describe, expect, it, beforeEach } from '@jest/globals';
import { usePlaybackStore, type PlaybackEntry } from '../playback-store';

function entry(overrides: Partial<PlaybackEntry>): PlaybackEntry {
  return {
    contentId: 'c_kum_saati',
    contentTitle: 'Kum Saati Protokolü',
    episodeId: 'e_kum_101',
    episodeTitle: 'Saat 03:14',
    seasonNumber: 1,
    episodeNumber: 1,
    positionSeconds: 300,
    durationSeconds: 1240,
    verticalPreviewUrl: null,
    posterUrl: null,
    accessType: 'FREE',
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('playback-store', () => {
  beforeEach(() => {
    usePlaybackStore.getState().clear();
  });

  it('ilerlemeyi kaydeder ve geri okur', () => {
    const { saveProgress, getProgress } = usePlaybackStore.getState();
    saveProgress(entry({}));
    const stored = getProgress('e_kum_101');
    expect(stored?.positionSeconds).toBe(300);
    expect(stored?.contentTitle).toBe('Kum Saati Protokolü');
  });

  it('%90 altı bölümler devam listesinde, üzerindekiler geçmişte', () => {
    const { saveProgress, continueWatching, completed } = usePlaybackStore.getState();
    // 300/1240 = ~%24 → devam
    saveProgress(entry({}));
    // 1200/1240 = ~%97 → tamamlanmış
    saveProgress(entry({ episodeId: 'e_kum_102', episodeNumber: 2, positionSeconds: 1200 }));
    expect(continueWatching().map((e) => e.episodeId)).toEqual(['e_kum_101']);
    expect(completed('e_kum_102')).toBe(true);
    expect(completed('e_kum_101')).toBe(false);
  });

  it('geçmiş en yeniye göre sıralanır (kayıt sırası)', async () => {
    const { saveProgress, history } = usePlaybackStore.getState();
    saveProgress(entry({ episodeId: 'e_kum_101' }));
    // store updatedAt'i Date.now() ile yazar; farklı milisaniye için bekle
    await new Promise((resolve) => setTimeout(resolve, 5));
    saveProgress(entry({ episodeId: 'e_kum_102', episodeNumber: 2 }));
    expect(history()[0]!.episodeId).toBe('e_kum_102');
  });

  it('remove girişi siler', () => {
    const { saveProgress, remove, getProgress } = usePlaybackStore.getState();
    saveProgress(entry({}));
    remove('e_kum_101');
    expect(getProgress('e_kum_101')).toBeUndefined();
  });
});
