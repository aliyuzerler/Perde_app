/**
 * Oynatıcı emirleri (FAZ 4) — expo-video VideoPlayer mutasyonları için
 * modül düzeyi komutlar.
 *
 * React Compiler, hook'tan dönen değerin (player) özellik atamalarını
 * "değiştirilemez değer" sayar; emirler burada, parametresi opak ayrı
 * işlevler içinde toplanır (ekran kodu derleyici dostu kalır).
 */
import type { VideoPlayer, SubtitleTrack } from 'expo-video';

/** Oynatıcıya kaynak atar (oturum yenilemede konum korunarak çağrılır). */
export function replacePlayerSource(player: VideoPlayer, uri: string | null): void {
  if (uri) player.replace(uri);
}

/** Konuma sarar (saniye). */
export function seekPlayer(player: VideoPlayer, seconds: number): void {
  player.currentTime = seconds;
}

/** Ses açma/kapama. */
export function setPlayerMuted(player: VideoPlayer, muted: boolean): void {
  player.muted = muted;
}

/** Altyazı parçası seçimi (null → kapalı). Desteklenmeyen platformda sessiz. */
export function setPlayerSubtitleTrack(player: VideoPlayer, track: SubtitleTrack | null): void {
  player.subtitleTrack = track;
}

/** timeUpdate olay aralığı (saniye). */
export function setPlayerTimeUpdateInterval(player: VideoPlayer, seconds: number): void {
  player.timeUpdateEventInterval = seconds;
}

/** Oynatmayı başlatır. */
export function startPlayer(player: VideoPlayer): void {
  void player.play();
}

/** Oynatmayı duraklatır. */
export function stopPlayer(player: VideoPlayer): void {
  player.pause();
}

/** Baştan başlatır (konum 0 + oynat). */
export function restartPlayer(player: VideoPlayer): void {
  player.replay();
}
