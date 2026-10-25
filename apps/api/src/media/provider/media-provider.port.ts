/**
 * MediaProvider portu (FAZ 4 — Kural D5: sağlayıcı bağımsızlığı).
 *
 * Video yayın sağlayıcısı (Bunny / Mux / Cloudflare Stream / geliştirme
 * LOCAL) bu arayüzün ardına yerleşir. Uygulama kodu (oynatma, yükleme,
 * durum takibi) SADECE bu portu bilir; sağlayıcı değişimi uygulamayı
 * değiştirmez — yalnızca yeni bir adapter + ortam değişkenleri gerekir
 * (docs/MEDIA_SETUP.md).
 *
 * Sorumluluklar:
 *  - createUploadTicket: SAĞLAYICIYA DOĞRUDAN yükleme için süreli/İMZALI
 *    anahtar üretir (büyük dosya backend gövdesinden asla taşınmaz).
 *  - settleUpload: doğrudan yüklemenin doğrulanması ve işleme durumuna alınması.
 *  - syncStatus: işleme durumu takibi (PROCESSING → READY).
 *  - buildPlaybackSources: HER oynatma oturumu için kısa ömürlü, imzalı
 *    akış URL'leri üretir (kalıcı public URL YOK — premium içerik dahil).
 */
import type { MediaProviderName } from '@perdego/contracts';
import type { Readable } from 'node:stream';

/** Sağlayıcıya doğrudan yükleme anahtarı. */
export interface ProviderUploadTicket {
  provider: MediaProviderName;
  providerAssetId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  maxSizeBytes: number;
  expiresAt: string;
}

/** Sağlayıcı tarafındaki asset işleme durumu. */
export interface ProviderStatus {
  state: 'AWAITING_UPLOAD' | 'PROCESSING' | 'READY' | 'ERROR';
  durationSeconds?: number;
  sizeBytes?: number;
  errorMessage?: string;
  /** READY olduğunda duyurulan metin parçaları (altyazı) referansları. */
  textTracks?: Array<{ language: string; label: string; sourceRef: string; isDefault?: boolean }>;
}

/** Oynatma kaynakları üretim bağlamı (oturum başına imza bilgileri). */
export interface PlaybackSourceContext {
  episodeId: string;
  providerAssetId: string;
  mediaId: string;
  /** Oynatma oturumu imzası — tüm kaynak URL'lerine taşınır. */
  sessionId: string;
  token: string;
  exp: number;
  /** İsteğin kökeni (mutlak URL üretimi için). */
  origin: string;
  /** Oturum doğrulaması sırasında okunan metin parçaları. */
  textTracks?: Array<{ language: string; label: string; sourceRef: string; isDefault?: boolean }>;
}

/** Oturum başına akış kaynakları (sağlayıcı yeteneğine göre kısmi). */
export interface ProviderPlaybackSources {
  hls?: string;
  mp4?: string;
  quality: string[];
  durationSeconds?: number;
}

/** Oynatma dosya isteklerinin (manifest/segment/vtt/mp4) çözüm sonucu. */
export interface ProviderFileResult {
  /** Yanıt içerik türü. */
  contentType: string;
  /** Dosya yolu (stream ile servis) veya içeriği (metin playlist'ler). */
  filePath?: string;
  body?: string;
  /** Manifest'ler için satır yeniden yazımı (segment URL'lerine imza). */
  rewrite?: (line: string) => string;
  /** İlerleyici oynatma için Range (bayt aralığı) desteği bilgisi. */
  sizeBytes?: number;
}

export interface MediaProviderPort {
  readonly name: MediaProviderName;

  /**
   * Yükleme anahtarı üretir. mediaId: EpisodeMedia satırı (AWAITING_UPLOAD)
   * kaydedildikten sonra çağrılır.
   */
  createUploadTicket(input: {
    mediaId: string;
    episodeId: string;
    originalName?: string;
    contentType?: string;
    origin: string;
  }): ProviderUploadTicket;

  /** İmzalı yükleme URL'ini doğrular (sağlayıcı ucu). Geçersizse hata fırlatır. */
  verifyUploadTicket(mediaId: string, token: string, exp: number): void;

  /**
   * Yükleme tamamlandı: dosyayı doğrular, işleme durumuna alır.
   * local: magic byte + süre çözümleme (ffprobe) → PROCESSING.
   */
  settleUpload(input: {
    mediaId: string;
    episodeId: string;
    originalName?: string;
    requestStream: Readable;
    declaredContentType?: string;
  }): Promise<ProviderStatus>;

  /** Durumu yeniler (local: gecikmeli PROCESSING → READY; bulut: API çağrısı). */
  syncStatus(input: {
    mediaId: string;
    episodeId: string;
    providerAssetId: string;
    originalName?: string | null;
    sizeBytes?: number | null;
  }): Promise<ProviderStatus>;

  /** Oynatma kaynakları (oturum başına imzalı). READY olmayan asset'te hata. */
  buildPlaybackSources(ctx: PlaybackSourceContext): Promise<ProviderPlaybackSources>;

  /** İmzalı dosya isteğini çözer (manifest/segment/vtt/mp4). */
  resolveFile(ctx: PlaybackSourceContext & { file: string }): Promise<ProviderFileResult>;

  /** Sağlayıcı asset'ini siler (medya kaydı silindiğinde). */
  deleteAsset(providerAssetId: string): Promise<void>;

  /** Opsiyonel yetenek (LOCAL): örnek paket dosyalarının varlığını erken denetler. */
  assertSamplePresent?(providerAssetId: string): void;
}
