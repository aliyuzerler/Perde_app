/**
 * İzleme ilerlemesi raporlayıcı (FAZ 4) — saf, saati enjekte edilebilir.
 *
 * Kurallar:
 *  - Konum değiştikçe `tick()` beslenir; FLUSH_ARALIGI (5 sn) dolduğunda
 *    ve en az MIN_POSITION_DELTA (5 sn) ilerleme varsa flush çağrılır.
 *  - `flushNow()` pause/background/unmount/ended'te anında yazım içindir
 *    (bekleyen delta yoksa sessizce atlanır — sahte "oynadı" kaydı yazılmaz).
 *  - Flush işlevi `bindFlush` ile bağlanır: örnek render'da bir kez üretilir,
 *    ekranın en güncel yazım işlevi her effect turunda yeniden bağlanır
 *    (bayat kapanış yok; React Compiler uyumlu — ref yazımı gerekmez).
 *  - flush hatası yutulmaz: dönen promise ekran tarafında yakalanır
 *    (yerel store zaten yazıldığından ağ hatası kayıp yaratmaz; bir sonraki
 *    oynatmada sunucuya yazılır).
 */

export const FLUSH_INTERVAL_MS = 5_000;
export const MIN_POSITION_DELTA = 5;

export type ProgressFlush = (positionSeconds: number) => void | Promise<void>;

export class ProgressReporter {
  private positionSeconds = 0;
  private lastFlushedPosition = 0;
  private lastFlushAt: number;
  private flushFn: ProgressFlush;
  private readonly now: () => number;
  private stopped = false;

  constructor(options: { flush?: ProgressFlush; now?: () => number } = {}) {
    this.flushFn = options.flush ?? (() => undefined);
    this.now = options.now ?? Date.now;
    this.lastFlushAt = this.now();
  }

  /** En güncel yazım işlevini bağlar (her persistPosition değişiminde). */
  bindFlush(flush: ProgressFlush): void {
    this.flushFn = flush;
  }

  /** Oynatıcı timeUpdate ile beslenir (pozisyon saniye, kesirli olabilir). */
  tick(positionSeconds: number): void {
    if (this.stopped) return;
    this.positionSeconds = positionSeconds;
    const elapsed = this.now() - this.lastFlushAt;
    const delta = Math.abs(this.positionSeconds - this.lastFlushedPosition);
    if (elapsed >= FLUSH_INTERVAL_MS && delta >= MIN_POSITION_DELTA) {
      void this.flushNow();
    }
  }

  /** Anında yazım (pause/background/unmount/ended). Delta yoksa yazmaz. */
  flushNow(): void | Promise<void> {
    if (this.stopped) return;
    const delta = Math.abs(this.positionSeconds - this.lastFlushedPosition);
    if (delta < 1) return; // 1 sn'den az ilerleme: sahte kayıt yok
    this.lastFlushedPosition = this.positionSeconds;
    this.lastFlushAt = this.now();
    return this.flushFn(Math.round(this.positionSeconds));
  }

  stop(): void {
    this.stopped = true;
  }

  /** Test/diagnostik: bekleyen (yazılmamış) pozisyon. */
  get pendingPosition(): number {
    return this.positionSeconds;
  }
}
