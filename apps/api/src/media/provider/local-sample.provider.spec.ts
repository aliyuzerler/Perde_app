/**
 * LOCAL örnek medya sağlayıcı birim testleri (FAZ 4).
 *
 * Kapsam: yükleme anahtarı imzası/süresi, dosya doğrulama akışı,
 * oynatma kaynakları ve imzalı dosya çözümlemesi, yol geçişi koruması.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { LocalSampleMediaProvider } from './local-sample.provider';
import type { Env } from '../../config/env.schema';
import { DomainError } from '../../common/errors';

/** Test Env — yalnızca sağlayıcının okuduğu alanlar. */
function makeEnv(overrides: Partial<Env> = {}): Env {
  const storage = mkdtempSync(path.join(tmpdir(), 'perdego-media-'));
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/unit_test',
    CORS_ORIGINS: '',
    PUBLIC_BASE_URL: 'http://localhost:3000',
    PLAYBACK_TTL_SECONDS: 300,
    PLAYBACK_MAX_PARALLEL: 2,
    MEDIA_PROVIDER: 'local',
    MEDIA_UPLOAD_TTL_SECONDS: 900,
    MEDIA_STORAGE_DIR: storage,
    MEDIA_MAX_UPLOAD_MB: 1,
    MEDIA_PROCESSING_DELAY_MS: 0,
    IDEMPOTENCY_TTL_HOURS: 24,
    SMTP_FROM: 'test@perdego.local',
    MAIL_OUTBOX_FILE: '/tmp/mail-outbox-unit.jsonl',
    VERIFY_EMAIL_TTL_MINUTES: 1440,
    RESET_TOKEN_TTL_MINUTES: 30,
    DELETION_GRACE_DAYS: 30,
    AUTH_RATE_LIMIT_WINDOW_SECONDS: 60,
    AUTH_RATE_LIMIT_LOGIN_MAX: 5,
    AUTH_RATE_LIMIT_REGISTER_MAX: 3,
    AUTH_RATE_LIMIT_RESET_MAX: 3,
    UPLOAD_DIR: 'uploads',
    ...overrides,
  } as unknown as Env;
}

/** Geçerli MP4 magic byte'lı küçük gövde (ftyp kutusu). */
const MP4_BODY = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypisom', 'latin1'),
  Buffer.alloc(64, 7),
]);

function streamOf(buffer: Buffer): Readable {
  return Readable.from([buffer]);
}

describe('LocalSampleMediaProvider', () => {
  let provider: LocalSampleMediaProvider;

  beforeAll(() => {
    provider = new LocalSampleMediaProvider(makeEnv());
  });

  describe('yükleme anahtarı (ticket)', () => {
    it('PUT URL üretir; token + exp taşır ve TTL süreli olur', () => {
      const before = Math.floor(Date.now() / 1000);
      const ticket = provider.createUploadTicket({
        mediaId: 'media-1',
        episodeId: 'ep-1',
        origin: 'http://localhost:4123',
      });
      const url = new URL(ticket.uploadUrl);
      expect(ticket.method).toBe('PUT');
      expect(url.pathname).toBe('/api/v1/media/upload/media-1');
      const exp = Number(url.searchParams.get('exp'));
      expect(exp).toBeGreaterThanOrEqual(before + 900 - 2);
      expect(ticket.expiresAt).toBeTruthy();
      expect(ticket.maxSizeBytes).toBe(1024 * 1024);
      expect(ticket.provider).toBe('LOCAL');
    });

    it('geçersiz token reddedilir (TOKEN_INVALID)', () => {
      expect(() => provider.verifyUploadTicket('media-1', 'saldiri', 4_000_000_000)).toThrow(
        DomainError,
      );
    });

    it('süresi geçen anahtar reddedilir (TOKEN_EXPIRED)', () => {
      const past = Math.floor(Date.now() / 1000) - 10;
      // Aynı imza farklı exp ile üretilemez; geçmiş exp + doğru imza üretmek
      // için provider'ın kendi sign'ı kullanılır (yalnız test amaçlı erişim).
      const signed = provider['sign'](`upload:m3:${past}`);
      try {
        provider.verifyUploadTicket('m3', signed, past);
        throw new Error('hata fırlamadı');
      } catch (err) {
        expect((err as DomainError).reason).toBe('TOKEN_EXPIRED');
      }
    });
  });

  describe('settleUpload (doğrudan yükleme)', () => {
    it('geçerli MP4 gövdesini yazar, boyut/süre bilgisi döner', async () => {
      const status = await provider.settleUpload({
        mediaId: 'm-valid',
        episodeId: 'e1',
        requestStream: streamOf(MP4_BODY),
      });
      expect(status.state).toBe('PROCESSING');
      expect(status.sizeBytes).toBe(MP4_BODY.length);
      const file = provider['uploadsDir'] + '/m-valid.mp4';
      expect(existsSync(file)).toBe(true);
    });

    it('sahte dosya (magic byte yanlış) reddedilir ve dosya silinir', async () => {
      const err = await provider
        .settleUpload({
          mediaId: 'm-fake',
          episodeId: 'e1',
          requestStream: streamOf(Buffer.from('Bu bir MP4 değildir ---')),
        })
        .catch((e: unknown) => e as DomainError);
      expect((err as DomainError).reason).toBe('UNSUPPORTED_MEDIA');
      expect(existsSync(provider['uploadsDir'] + '/m-fake.mp4')).toBe(false);
    });

    it('üst sınır aşımında UPLOAD_TOO_LARGE verir', async () => {
      const big = Buffer.alloc(1024 * 1024 + 100, 1);
      // İlk baytlar ftyp'e benzemese de sınır hatası önce gelmelidir —
      // akış boyutu aşıldığında hata fırlatılır.
      const err = await provider
        .settleUpload({
          mediaId: 'm-big',
          episodeId: 'e1',
          requestStream: streamOf(big),
        })
        .catch((e: unknown) => e as DomainError);
      expect((err as DomainError).reason).toBe('UPLOAD_TOO_LARGE');
    });
  });

  describe('oynatma kaynakları', () => {
    it('örnek paket için imzalı HLS + MP4 kaynakları üretir', async () => {
      const sources = await provider.buildPlaybackSources({
        episodeId: 'ep1',
        providerAssetId: 'sample:a',
        mediaId: 'm1',
        sessionId: 's1',
        token: 'tok',
        exp: 4_000_000_000,
        origin: 'http://localhost:4123',
      });
      expect(sources.hls).toContain('/api/v1/media/hls/ep1/s1/master.m3u8');
      expect(sources.hls).toContain('token=tok');
      expect(sources.mp4).toContain('video.mp4');
      expect(sources.quality).toEqual(['240p', '360p', '540p']);
    });

    it('bilinmeyen asset kimliğini reddeder', async () => {
      await expect(
        provider.buildPlaybackSources({
          episodeId: 'ep1',
          providerAssetId: 'bilinmeyen',
          mediaId: 'm1',
          sessionId: 's1',
          token: 'tok',
          exp: 1,
          origin: 'http://x',
        }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe('resolveFile (imzalı dosya servisi)', () => {
    const ctxBase = {
      episodeId: 'ep1',
      providerAssetId: 'sample:a',
      mediaId: 'm1',
      sessionId: 's1',
      token: 'tok',
      exp: 4_000_000_000,
      origin: 'http://localhost:4123',
    };

    beforeAll(() => {
      // Örnek paket dosyaları bu depoda scripts/generate-sample-media.sh ile
      // üretilir; gerçek paket yoksa sentetik paket iskeletiyle davranış test edilir.
      const bundleDir = path.join(provider['samplesDir'], 'a');
      const masterPath = path.join(bundleDir, 'master.m3u8');
      if (!existsSync(masterPath)) {
        mkdirSync(path.join(bundleDir, '240p'), { recursive: true });
        mkdirSync(path.join(bundleDir, 'subtitles'), { recursive: true });
        writeFileSync(
          masterPath,
          [
            '#EXTM3U',
            '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Türkçe",LANGUAGE="tr",URI="subtitles/tr.vtt"',
            '#EXT-X-STREAM-INF:BANDWIDTH=1',
            '240p/playlist.m3u8',
          ].join('\n'),
        );
        writeFileSync(path.join(bundleDir, '240p', 'playlist.m3u8'), '#EXTM3U\n#EXT-X-ENDLIST\n');
        writeFileSync(path.join(bundleDir, 'subtitles', 'tr.vtt'), 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:05.000\nmerhaba\n');
        writeFileSync(path.join(bundleDir, 'video.mp4'), MP4_BODY);
      }
    });

    it('master manifest segment satırlarını imzalı mutlak URL\'e yazar', async () => {
      const result = await provider.resolveFile({ ...ctxBase, file: 'master.m3u8' });
      expect(result.contentType).toBe('application/vnd.apple.mpegurl');
      const lines = (result.body ?? '').split('\n');
      const streamLine = lines.find((l) => l.endsWith('240p/playlist.m3u8'));
      // Dosya adı birebir eşleşmez (imzalı mutlak URL), ama imza parametreleri taşınır:
      const signedLine = lines.find((l) => l.includes('token=tok') && l.includes('240p'));
      expect(streamLine).toBeUndefined(); // ham göreli satır KALMAMALI
      expect(signedLine).toContain('http://localhost:4123/api/v1/media/hls/ep1/s1/');
      expect(signedLine).toContain('exp=4000000000');
    });

    it('altyazı URI satırı da imzalanır (EXT-X-MEDIA)', async () => {
      const result = await provider.resolveFile({ ...ctxBase, file: 'master.m3u8' });
      const uriLine = (result.body ?? '')
        .split('\n')
        .find((l) => l.includes('EXT-X-MEDIA') && l.includes('subtitles/tr.vtt'));
      expect(uriLine).toContain('token=tok');
      expect(uriLine).toContain('http://localhost:4123/api/v1/media/hls/ep1/s1/subtitles/tr.vtt');
      const vtt = await provider.resolveFile({ ...ctxBase, file: 'subtitles/tr.vtt' });
      expect(vtt.contentType).toContain('text/vtt');
      expect(vtt.filePath).toBeTruthy();
    });

    it('yol geçişi (..) ve mutlak yollar reddedilir', async () => {
      await expect(provider.resolveFile({ ...ctxBase, file: '../uploads/m-valid.mp4' })).rejects.toThrow(
        DomainError,
      );
      await expect(provider.resolveFile({ ...ctxBase, file: '/etc/passwd' })).rejects.toThrow(DomainError);
    });

    it('izinli küme dışı dosya adları reddedilir', async () => {
      await expect(provider.resolveFile({ ...ctxBase, file: '240p/seg9999.ts' })).rejects.toThrow(
        DomainError,
      );
      await expect(provider.resolveFile({ ...ctxBase, file: 'server.ts' })).rejects.toThrow(DomainError);
    });

    it('video.mp4 dosya yolu + boyut ile döner', async () => {
      const result = await provider.resolveFile({ ...ctxBase, file: 'video.mp4' });
      expect(result.contentType).toBe('video/mp4');
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(existsSync(result.filePath!)).toBe(true);
    });
  });

  describe('upload asset yolları', () => {
    it('upload: asset için yalnızca video.mp4 ve altyazı çözülür', async () => {
      const file = provider.uploadFilePath('upload:m-valid')!;
      writeFileSync(file, MP4_BODY);
      const result = await provider.resolveFile({
        episodeId: 'e1',
        providerAssetId: 'upload:m-valid',
        mediaId: 'm-valid',
        sessionId: 's1',
        token: 't',
        exp: 1,
        origin: 'http://x',
        file: 'video.mp4',
      });
      expect(result.contentType).toBe('video/mp4');
      await expect(
        provider.resolveFile({
          episodeId: 'e1',
          providerAssetId: 'upload:m-valid',
          mediaId: 'm-valid',
          sessionId: 's1',
          token: 't',
          exp: 1,
          origin: 'http://x',
          file: 'master.m3u8',
        }),
      ).rejects.toThrow(DomainError);
    });

    it('geçersiz mediaId ile yol hesaplanamaz (null)', () => {
      expect(provider.uploadFilePath('upload:../../etc/passwd')).toBeNull();
      expect(provider.uploadFilePath('sample:a')).toBeNull();
    });
  });

  describe('syncStatus (işleme durumu)', () => {
    it('dosya yoksa AWAITING_UPLOAD döner', async () => {
      const status = await provider.syncStatus({
        mediaId: 'm-yok',
        episodeId: 'e1',
        providerAssetId: 'upload:m-yok',
      });
      expect(status.state).toBe('AWAITING_UPLOAD');
    });

    it('dosya varsa gecikmesiz READY + demo altyazı döner', async () => {
      const file = provider.uploadFilePath('upload:m-ready')!;
      writeFileSync(file, MP4_BODY);
      const status = await provider.syncStatus({
        mediaId: 'm-ready',
        episodeId: 'e1',
        providerAssetId: 'upload:m-ready',
      });
      expect(status.state).toBe('READY');
      expect(status.sizeBytes).toBe(MP4_BODY.length);
      expect(status.textTracks?.map((t) => t.language)).toEqual(['tr', 'en']);
    });

    it('PROCESSING gecikmesi süresince READY verilmez', async () => {
      const delayed = new LocalSampleMediaProvider(makeEnv({ MEDIA_PROCESSING_DELAY_MS: 60_000 }));
      const file = delayed.uploadFilePath('upload:m-delay')!;
      mkdirSync(delayed['uploadsDir'], { recursive: true });
      writeFileSync(file, MP4_BODY);
      const status = await delayed.syncStatus({
        mediaId: 'm-delay',
        episodeId: 'e1',
        providerAssetId: 'upload:m-delay',
      });
      expect(status.state).toBe('PROCESSING');
    });
  });

  describe('deleteAsset', () => {
    it('yükleme dosyasını siler, örnek paketlere dokunmaz', async () => {
      const file = provider.uploadFilePath('upload:m-del')!;
      writeFileSync(file, MP4_BODY);
      await provider.deleteAsset('upload:m-del');
      expect(existsSync(file)).toBe(false);
      await expect(provider.deleteAsset('sample:a')).resolves.toBeUndefined();
    });
  });
});
