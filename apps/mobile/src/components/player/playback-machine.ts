/**
 * Oynatma durum makinesi (FAZ 4) — saf, çerçeveden bağımsız.
 *
 * expo-video olayları (statusChange/playingChange/playToEnd) ile sunucu
 * oturumu (süre sonu) ve ağ durumu bu makinede BİRLEŞİR; ekran yalnızca
 * türetilmiş fazı çizer. Saf olduğu için jest'ta expo-video olmadan test
 * edilir (native modül jest ortamında koşmaz).
 *
 * Fazlar:
 *   acquiring   → oturum/sunucu kararı bekleniyor
 *   locked      → sunucu erişim kararı olumsuz (402/403 — UI kilit görünümü)
 *   preparing   → kaynak yüklendi, medya hazır olmadı (ilk tampon)
 *   playing     → çalıyor
 *   paused      → hazır ama duraklatılmış
 *   buffering   → çalarken veri bekliyor (statusChange loading)
 *   stalled     → ağ kesik (offline)
 *   error       → oynatma hatası (statusChange error / kaynak yok)
 *   ended       → bölüm sonu (playToEnd)
 */

export type PlaybackPhase =
  | 'acquiring'
  | 'locked'
  | 'preparing'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'stalled'
  | 'error'
  | 'ended';

/** Oynatıcıdan gelen ham olay girdileri. */
export interface PlaybackSignals {
  /** Oynatıcı statusChange durumu. */
  playerStatus: 'idle' | 'loading' | 'readyToPlay' | 'error';
  isPlaying: boolean;
  /** playToEnd olayı (bir kez). */
  playToEnd: boolean;
  /** Ağ bağlantısı var mı (use-network). */
  isOnline: boolean;
  /** Oynatma kaynağı (imzalı URL) atanmış mı. */
  hasSource: boolean;
}

/** Oynatma fazını türetir — tek doğruluk kaynağı (parite testli). */
export function derivePhase(signals: PlaybackSignals): PlaybackPhase {
  const { playerStatus, isPlaying, playToEnd, isOnline, hasSource } = signals;

  if (!isOnline) return 'stalled';
  if (playToEnd) return 'ended';
  if (playerStatus === 'error') return 'error';

  if (!hasSource) return 'acquiring';
  if (playerStatus === 'idle') return 'acquiring';
  if (playerStatus === 'loading') return isPlaying ? 'buffering' : 'preparing';

  // readyToPlay:
  return isPlaying ? 'playing' : 'paused';
}

/** Oturumun süresi dolmak üzere mi (yenileme eşiği: kalan ≤ 60 sn)? */
export function isSessionExpiring(expiresAtIso: string, nowMs: number, marginMs = 60_000): boolean {
  const expiresAt = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt - nowMs <= marginMs;
}

/**
 * Oynatıcıya verilecek kaynak seçimi (platform duyarlı):
 *  - native → HLS (ABR, altyazı grubu) varsa HLS; yoksa ilerleyici mp4
 *  - web    → tarayıcılar HLS'i yerel oynatamadığından mp4 yedek
 */
export function pickPlaybackSource(
  sources: { hls?: string; mp4?: string },
  platform: 'web' | 'native'
): string | null {
  if (platform === 'web') return sources.mp4 ?? sources.hls ?? null;
  return sources.hls ?? sources.mp4 ?? null;
}

/** Bölüm sonu eşiği: son 0.75 sn içinde bitiş sayılır (playToEnd yedeği). */
export function isNearEnd(positionSeconds: number, durationSeconds: number): boolean {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;
  return positionSeconds >= durationSeconds - 0.75;
}
