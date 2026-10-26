/**
 * FAZ 4 oynatıcı mantık testleri — saf modüller (expo-video mock'lanmaz;
 * native modül jest ortamında koşmaz, saf katman koşar).
 */
import { describe, expect, it } from '@jest/globals';
import {
  derivePhase,
  isSessionExpiring,
  pickPlaybackSource,
  isNearEnd,
} from '../playback-machine';
import {
  ProgressReporter,
  FLUSH_INTERVAL_MS,
  MIN_POSITION_DELTA,
} from '../progress-reporter';
import { findEpisodeNeighbors, flattenPlayableEpisodes } from '@/hooks/player/use-episode-neighbors';
import type { CatalogSeason } from '@perdego/contracts';

describe('derivePhase (oynatma durum makinesi)', () => {
  const base = {
    playerStatus: 'readyToPlay',
    isPlaying: false,
    playToEnd: false,
    isOnline: true,
    hasSource: true,
  } as const;

  it('kaynak yokken acquiring bekler', () => {
    expect(derivePhase({ ...base, hasSource: false, playerStatus: 'idle' })).toBe('acquiring');
  });

  it('hazır ve durmus → paused; hazır ve calıyor → playing', () => {
    expect(derivePhase(base)).toBe('paused');
    expect(derivePhase({ ...base, isPlaying: true })).toBe('playing');
  });

  it('calırken loading → buffering; dururken loading → preparing', () => {
    expect(derivePhase({ ...base, isPlaying: true, playerStatus: 'loading' })).toBe('buffering');
    expect(derivePhase({ ...base, isPlaying: false, playerStatus: 'loading' })).toBe('preparing');
  });

  it('ag yokken stalled (hatadan/sondan oncelikli)', () => {
    expect(derivePhase({ ...base, isOnline: false })).toBe('stalled');
    expect(derivePhase({ ...base, isOnline: false, playerStatus: 'error' })).toBe('stalled');
  });

  it('playToEnd → ended; oynatıcı hatası → error', () => {
    expect(derivePhase({ ...base, playToEnd: true, isPlaying: true })).toBe('ended');
    expect(derivePhase({ ...base, playerStatus: 'error' })).toBe('error');
  });
});

describe('isSessionExpiring (oturum yenileme esigi)', () => {
  it('kalan sure esik altındaysa true', () => {
    const now = Date.now();
    const expiring = new Date(now + 30_000).toISOString();
    expect(isSessionExpiring(expiring, now)).toBe(true);
  });

  it('sure hala uzundysa false', () => {
    const now = Date.now();
    const fresh = new Date(now + 4 * 60_000).toISOString();
    expect(isSessionExpiring(fresh, now)).toBe(false);
  });

  it('gecersiz tarih false doner (cokmez)', () => {
    expect(isSessionExpiring('gecersiz', Date.now())).toBe(false);
  });
});

describe('pickPlaybackSource (platform kaynak secimi)', () => {
  it('native HLS tercih eder, web mp4 u', () => {
    const sources = { hls: 'https://a/master.m3u8', mp4: 'https://a/video.mp4' };
    expect(pickPlaybackSource(sources, 'native')).toBe(sources.hls);
    expect(pickPlaybackSource(sources, 'web')).toBe(sources.mp4);
  });

  it('tek kaynakta duser: HLS yoksa native mp4, mp4 yoksa web HLS', () => {
    expect(pickPlaybackSource({ mp4: 'https://a/video.mp4' }, 'native')).toBe('https://a/video.mp4');
    expect(pickPlaybackSource({ hls: 'https://a/master.m3u8' }, 'web')).toBe('https://a/master.m3u8');
  });

  it('kaynak yoksa null', () => {
    expect(pickPlaybackSource({}, 'native')).toBeNull();
  });
});

describe('isNearEnd (bitis esigi yedegi)', () => {
  it('son 0.75 sn icinde true; gecersiz surede false', () => {
    expect(isNearEnd(11.5, 12)).toBe(true);
    expect(isNearEnd(5, 12)).toBe(false);
    expect(isNearEnd(5, 0)).toBe(false);
  });
});

describe('ProgressReporter (ilerleme yazimi)', () => {
  function makeClock() {
    let now = 1_000_000;
    return {
      now: () => now,
      advance: (ms: number) => {
        now += ms;
      },
    };
  }

  it('aralık + delta dolmadan flush etmez', () => {
    const clock = makeClock();
    const flushed: number[] = [];
    const reporter = new ProgressReporter({
      flush: (p) => {
        flushed.push(p);
      },
      now: clock.now,
    });
    reporter.tick(3);
    clock.advance(FLUSH_INTERVAL_MS + 1);
    reporter.tick(3); // delta yok → yazmaz (sahte kayıt engeli)
    expect(flushed).toEqual([]);
  });

  it('aralık + delta dolunca flush eder', () => {
    const clock = makeClock();
    const flushed: number[] = [];
    const reporter = new ProgressReporter({
      flush: (p) => {
        flushed.push(p);
      },
      now: clock.now,
    });
    reporter.tick(MIN_POSITION_DELTA + 1);
    clock.advance(FLUSH_INTERVAL_MS + 1);
    reporter.tick(MIN_POSITION_DELTA + 1);
    expect(flushed).toEqual([MIN_POSITION_DELTA + 1]);
  });

  it('flushNow anında yazar; 1 sn altı ilerlemede yazmaz', () => {
    const clock = makeClock();
    const flushed: number[] = [];
    const reporter = new ProgressReporter({
      flush: (p) => {
        flushed.push(p);
      },
      now: clock.now,
    });
    reporter.tick(0.4);
    reporter.flushNow();
    expect(flushed).toEqual([]);
    reporter.tick(12.6);
    reporter.flushNow();
    expect(flushed).toEqual([13]); // yuvarlanmış pozisyon
  });

  it('stop sonrası tick/flush yok sayılır', () => {
    const clock = makeClock();
    const flushed: number[] = [];
    const reporter = new ProgressReporter({
      flush: (p) => {
        flushed.push(p);
      },
      now: clock.now,
    });
    reporter.tick(30);
    reporter.stop();
    reporter.flushNow();
    expect(flushed).toEqual([]);
  });
});

describe('episode neighbors (onceki/sonraki bolum)', () => {
  const seasons: CatalogSeason[] = [
    {
      id: 's2',
      seasonNumber: 2,
      episodes: [
        {
          id: 'e21',
          seasonNumber: 2,
          episodeNumber: 1,
          title: 'Ciceklenme',
          durationSeconds: 500,
          accessType: 'CREDIT',
          access: { canPlay: true, reason: 'UNLOCKED' },
        },
      ],
    },
    {
      id: 's1',
      seasonNumber: 1,
      episodes: [
        { id: 'e11', seasonNumber: 1, episodeNumber: 1, title: 'Tohum', durationSeconds: 480, accessType: 'FREE' },
        {
          id: 'e12',
          seasonNumber: 1,
          episodeNumber: 2,
          title: 'Sulama',
          durationSeconds: 465,
          accessType: 'CREDIT',
          access: { canPlay: true, reason: 'UNLOCKED' },
        },
        {
          id: 'e13',
          seasonNumber: 1,
          episodeNumber: 3,
          title: 'Hasat',
          durationSeconds: 470,
          accessType: 'CREDIT',
          access: { canPlay: false, reason: 'NEEDS_CREDITS' },
        },
      ],
    },
  ];

  it('duzlestirme sezon sırasına dizer ve yalnız canPlay bolumleri alır', () => {
    const flat = flattenPlayableEpisodes(seasons);
    expect(flat.map((e) => e.episodeId)).toEqual(['e11', 'e12', 'e21']);
  });

  it('komsular sıralı duzlemde hesaplanır (onceki/sonraki)', () => {
    const first = findEpisodeNeighbors(seasons, 'e11');
    expect(first.next?.episodeId).toBe('e12');
    expect(first.previous).toBeNull();
    expect(first.index).toBe(0);

    const mid = findEpisodeNeighbors(seasons, 'e12');
    expect(mid.previous?.episodeId).toBe('e11');
    expect(mid.next?.episodeId).toBe('e21');

    const last = findEpisodeNeighbors(seasons, 'e21');
    expect(last.next).toBeNull();
  });

  it('bilinmeyen bolumde index -1 ve komsular null', () => {
    const none = findEpisodeNeighbors(seasons, 'yok');
    expect(none.index).toBe(-1);
    expect(none.previous).toBeNull();
    expect(none.next).toBeNull();
  });
});
