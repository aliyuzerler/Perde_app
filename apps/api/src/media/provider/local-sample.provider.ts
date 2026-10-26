/**
 * LOCAL örnek sağlayıcı adapter (FAZ 4 — geliştirme).
 *
 * Telifsiz sentetik dikey HLS paketlerini (scripts/generate-sample-media.sh
 * üretir) ve yönetim tarafından yüklenen dosyaları servis eder.
 *
 * Güvenlik modeli:
 *  - Yükleme: süreli + HMAC imzalı PUT URL (backend üretir; "sağlayıcı"
 *    bu uçtur). Gövde bayt akışı doğrudan diske yazılır; bellek/dosya
 *    sınırları zorlanır, magic byte doğrulanır (sahte mp4 kabul edilmez).
 *  - Oynatma: tüm dosyalar (manifest/segment/vtt/mp4) oynatma oturumu
 *    imzası olmadan ERİŞİLEMEZ; premium içerik daima oturum bağlıdır.
 *  - Kalıcı public bağlantı yoktur: her oturum kendi imzalı URL'lerini alır.
 *
 * Asset kimlik biçimi:
 *   sample:a|b|c        → önceden üretilmiş HLS paketleri (seed)
 *   upload:<mediaId>    → yönetim yüklemesi (MP4 ilerleyici servis edilir;
 *                         gerçek sağlayıcılar HLS transkodu yapar — belge)
 */
import { createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { Injectable, Inject } from '@nestjs/common';
import type { Env } from '../../config/env.schema';
import { ENV } from '../../config/env.module';
import { DomainError } from '../../common/errors';
import type { Readable } from 'node:stream';
import type {
  MediaProviderPort,
  PlaybackSourceContext,
  ProviderFileResult,
  ProviderPlaybackSources,
  ProviderStatus,
  ProviderUploadTicket,
} from './media-provider.port';

const SAMPLE_BUNDLES = ['a', 'b', 'c'] as const;
const ALLOWED_SAMPLE_VARIANTS = ['240p', '360p', '540p'];

@Injectable()
export class LocalSampleMediaProvider implements MediaProviderPort {
  readonly name = 'LOCAL' as const;

  constructor(@Inject(ENV) private readonly env: Env) {}

  private get storageRoot(): string {
    return path.resolve(process.cwd(), this.env.MEDIA_STORAGE_DIR);
  }

  private get uploadsDir(): string {
    return path.join(this.storageRoot, 'uploads');
  }

  private get samplesDir(): string {
    return path.join(this.storageRoot, 'samples');
  }

  private signingSecret(): string {
    return this.env.WEBHOOK_SIGNING_SECRET ?? `perdego-dev-media-${this.env.DATABASE_URL.slice(-24)}`;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.signingSecret()).update(payload).digest('hex').slice(0, 32);
  }

  private signedPath(base: string, pathname: string, exp: number, token: string): string {
    return `${base}${pathname}?token=${token}&exp=${exp}`;
  }

  // ------------------------------------------------------------------ upload

  createUploadTicket(input: {
    mediaId: string;
    episodeId: string;
    originalName?: string;
    contentType?: string;
    origin: string;
  }): ProviderUploadTicket {
    const expSec = Math.floor(Date.now() / 1000) + this.env.MEDIA_UPLOAD_TTL_SECONDS;
    const token = this.sign(`upload:${input.mediaId}:${expSec}`);
    const base = input.origin.replace(/\/+$/, '');
    return {
      provider: this.name,
      providerAssetId: `upload:${input.mediaId}`,
      uploadUrl: this.signedPath(base, `/api/v1/media/upload/${input.mediaId}`, expSec, token),
      method: 'PUT',
      headers: {
        'Content-Type': input.contentType ?? 'application/octet-stream',
      },
      maxSizeBytes: this.env.MEDIA_MAX_UPLOAD_MB * 1024 * 1024,
      expiresAt: new Date(expSec * 1000).toISOString(),
    };
  }

  verifyUploadTicket(mediaId: string, token: string, exp: number): void {
    const expected = this.sign(`upload:${mediaId}:${exp}`);
    if (token !== expected) {
      throw DomainError.forbidden('TOKEN_INVALID', 'errors.tokenInvalid');
    }
    if (exp * 1000 < Date.now()) {
      throw DomainError.forbidden('TOKEN_EXPIRED', 'errors.tokenExpired');
    }
  }

  async settleUpload(input: {
    mediaId: string;
    episodeId: string;
    originalName?: string;
    requestStream: Readable;
    declaredContentType?: string;
  }): Promise<ProviderStatus> {
    mkdirSync(this.uploadsDir, { recursive: true });
    const target = path.join(this.uploadsDir, `${input.mediaId}.mp4`);
    const maxBytes = this.env.MEDIA_MAX_UPLOAD_MB * 1024 * 1024;

    await new Promise<void>((resolve, reject) => {
      const out = createWriteStreamSafe(target);
      let received = 0;
      let firstChunk: Buffer | null = null;
      input.requestStream.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxBytes) {
          input.requestStream.destroy();
          out.destroy();
          safeUnlink(target);
          reject(
            DomainError.badRequest('UPLOAD_TOO_LARGE', 'errors.uploadTooLarge', {
              maxSizeMB: this.env.MEDIA_MAX_UPLOAD_MB,
            }),
          );
          return;
        }
        if (firstChunk === null && chunk.length > 0) firstChunk = chunk;
        out.write(chunk);
      });
      input.requestStream.on('error', (err) => {
        safeUnlink(target);
        reject(err);
      });
      input.requestStream.on('end', () => {
        out.end(() => {
          // Magic byte doğrulaması: MP4 'ftyp' kutusu 4-8 baytlarında beklenir.
          if (!firstChunk || firstChunk.length < 12 || firstChunk.toString('latin1', 4, 8) !== 'ftyp') {
            safeUnlink(target);
            reject(DomainError.badRequest('UNSUPPORTED_MEDIA', 'errors.unsupportedMedia'));
            return;
          }
          resolve();
        });
      });
    });

    const sizeBytes = statSync(target).size;
    const durationSeconds = await probeDurationSeconds(target).catch(() => undefined);
    return {
      state: 'PROCESSING',
      sizeBytes,
      durationSeconds,
    };
  }

  syncStatus(input: {
    mediaId: string;
    episodeId: string;
    providerAssetId: string;
    originalName?: string | null;
    sizeBytes?: number | null;
  }): Promise<ProviderStatus> {
    const filePath = this.uploadFilePath(input.providerAssetId);
    if (!filePath || !existsSync(filePath)) {
      return Promise.resolve({ state: 'AWAITING_UPLOAD' });
    }
    const stat = statSync(filePath);
    // Gecikmeli transkod taklidi: MEDIA_PROCESSING_DELAY_MS sonunda READY.
    const mtimeMs = stat.mtimeMs;
    const elapsed = Date.now() - mtimeMs;
    if (this.env.MEDIA_PROCESSING_DELAY_MS > 0 && elapsed < this.env.MEDIA_PROCESSING_DELAY_MS) {
      return Promise.resolve({ state: 'PROCESSING', sizeBytes: stat.size });
    }
    return probeDurationSeconds(filePath)
      .then((durationSeconds) => ({
        state: 'READY' as const,
        sizeBytes: stat.size,
        durationSeconds,
        textTracks: this.demoTextTracks(),
      }))
      // ffprobe yoksa/çözümleyemezse dosya oynanabilir olabilir: süre bilinmiyor
      // olarak READY verilir (bozuk dosya oynatma anında ERROR'a düşer).
      .catch(() => ({
        state: 'READY' as const,
        sizeBytes: stat.size,
        textTracks: this.demoTextTracks(),
      }));
  }

  // ---------------------------------------------------------------- playback

  async buildPlaybackSources(ctx: PlaybackSourceContext): Promise<ProviderPlaybackSources> {
    const base = ctx.origin.replace(/\/+$/, '');
    const exp = ctx.exp;
    const token = ctx.token;
    const root = `/api/v1/media/hls/${ctx.episodeId}/${ctx.sessionId}`;

    if (ctx.providerAssetId.startsWith('sample:')) {
      const bundle = ctx.providerAssetId.slice('sample:'.length);
      assertSampleBundle(bundle);
      const master = this.signedPath(base, `${root}/master.m3u8`, exp, token);
      const mp4 = this.signedPath(base, `${root}/video.mp4`, exp, token);
      return {
        hls: master,
        mp4,
        quality: [...ALLOWED_SAMPLE_VARIANTS],
      };
    }

    if (ctx.providerAssetId.startsWith('upload:')) {
      const file = this.uploadFilePath(ctx.providerAssetId);
      if (!file || !existsSync(file)) {
        throw DomainError.conflict('EPISODE_NOT_READY', 'errors.episodeNotReady');
      }
      const mp4 = this.signedPath(base, `${root}/video.mp4`, exp, token);
      return { mp4, quality: ['auto'] };
    }

    throw DomainError.conflict('MEDIA_ASSET_UNKNOWN', 'errors.mediaAssetUnknown');
  }

  async resolveFile(ctx: PlaybackSourceContext & { file: string }): Promise<ProviderFileResult> {
    const token = ctx.token;
    const exp = ctx.exp;
    const base = ctx.origin.replace(/\/+$/, '');
    const root = `/api/v1/media/hls/${ctx.episodeId}/${ctx.sessionId}`;

    if (ctx.providerAssetId.startsWith('sample:')) {
      const bundle = ctx.providerAssetId.slice('sample:'.length);
      assertSampleBundle(bundle);
      const bundleDir = path.join(this.samplesDir, bundle);
      return resolveSampleFile({ file: ctx.file, bundleDir, base, root, token: token, exp });
    }

    if (ctx.providerAssetId.startsWith('upload:')) {
      const file = this.uploadFilePath(ctx.providerAssetId);
      if (!file || !existsSync(file)) {
        throw DomainError.notFound('MEDIA_FILE_NOT_FOUND', 'errors.notFound');
      }
      if (ctx.file === 'video.mp4') {
        return { contentType: 'video/mp4', filePath: file, sizeBytes: statSync(file).size };
      }
      if (ctx.file.startsWith('subtitles/')) {
        return this.resolveDemoSubtitle(ctx.file);
      }
      throw DomainError.notFound('MEDIA_FILE_NOT_FOUND', 'errors.notFound');
    }

    throw DomainError.conflict('MEDIA_ASSET_UNKNOWN', 'errors.mediaAssetUnknown');
  }

  /** Yüklü dosyalar için demo altyazı (gerçek sağlayıcıda transkod sırasında üretilir). */
  private resolveDemoSubtitle(file: string): ProviderFileResult {
    const lang = file === 'subtitles/tr.vtt' ? 'tr' : file === 'subtitles/en.vtt' ? 'en' : null;
    if (!lang) throw DomainError.notFound('MEDIA_FILE_NOT_FOUND', 'errors.notFound');
    const body = [
      'WEBVTT',
      '',
      '1',
      '00:00:00.500 --> 00:00:10.000',
      lang === 'tr' ? 'PerdeGo demo altyazısı (yüklenen akış)' : 'PerdeGo demo subtitle (uploaded stream)',
    ].join('\n');
    return { contentType: 'text/vtt; charset=utf-8', body };
  }

  demoTextTracks(): Array<{ language: string; label: string; sourceRef: string; isDefault?: boolean }> {
    return [
      { language: 'tr', label: 'Türkçe', sourceRef: 'subtitles/tr.vtt', isDefault: true },
      { language: 'en', label: 'English', sourceRef: 'subtitles/en.vtt' },
    ];
  }

  uploadFilePath(providerAssetId: string): string | null {
    if (!providerAssetId.startsWith('upload:')) return null;
    const mediaId = providerAssetId.slice('upload:'.length);
    // Yol geçişi engeli: mediaId kısıtlı küme dışındaysa reddet.
    if (!/^[A-Za-z0-9_-]+$/.test(mediaId)) return null;
    return path.join(this.uploadsDir, `${mediaId}.mp4`);
  }

  async deleteAsset(providerAssetId: string): Promise<void> {
    if (providerAssetId.startsWith('sample:')) return; // paketler paylaşımlıdır
    const file = this.uploadFilePath(providerAssetId);
    if (file && existsSync(file)) unlinkSync(file);
  }

  /** Test/seed yardımcıları — LOCAL sağlayıcıya özgü. */

  /** Örnek paket kimliği üretir (round-robin deterministik). */
  sampleAssetId(index: number): string {
    const bundle = SAMPLE_BUNDLES[index % SAMPLE_BUNDLES.length]!;
    return `sample:${bundle}`;
  }

  /** Örnek paketin varlığını denetler (kurulum belgesindeki script koşulmuş mu). */
  assertSamplePresent(providerAssetId: string): void {
    if (!providerAssetId.startsWith('sample:')) return;
    const bundle = providerAssetId.slice('sample:'.length);
    assertSampleBundle(bundle);
    const master = path.join(this.samplesDir, bundle, 'master.m3u8');
    if (!existsSync(master)) {
      throw DomainError.conflict('MEDIA_MISSING', 'errors.mediaMissing', {
        hint: 'bash scripts/generate-sample-media.sh',
      });
    }
  }

  /** Süreli imzalı doğrudan oynatma dışı dosya (örn. örnek MP4'ün kopyalanması için). */
  sampleMasterPath(bundle: string): string {
    return path.join(this.samplesDir, bundle, 'master.m3u8');
  }

  /** Yeni yükleme için rastgele asset alt kimliği. */
  newUploadId(): string {
    return randomUUID();
  }
}

// ------------------------------------------------------------------- helpers

function assertSampleBundle(bundle: string): void {
  if (!(SAMPLE_BUNDLES as readonly string[]).includes(bundle)) {
    throw DomainError.notFound('MEDIA_FILE_NOT_FOUND', 'errors.notFound');
  }
}

/** Sample dosyası çözümlemesi: master/varyant playlist (yeniden yazımlı), segment, vtt, mp4. */
function resolveSampleFile(args: {
  file: string;
  bundleDir: string;
  base: string;
  root: string;
  token: string;
  exp: number;
}): ProviderFileResult {
  const { file, bundleDir, base, root, token, exp } = args;
  // Yol geçişi koruması: '..' ve mutlak yollar reddedilir.
  if (file.includes('..') || file.startsWith('/')) {
    throw DomainError.notFound('MEDIA_FILE_NOT_FOUND', 'errors.notFound');
  }

  const isMaster = file === 'master.m3u8';
  const variantMatch = /^\/?(240p|360p|540p)\/playlist\.m3u8$/.exec(file);
  const isVariant = variantMatch !== null;
  const isSegment = /^\/?(240p|360p|540p)\/seg\d+\.ts$/.test(file);
  const isSubtitle = /^\/?subtitles\/(tr|en)\.vtt$/.test(file);
  const isVideo = file === 'video.mp4';

  if (!isMaster && !isVariant && !isSegment && !isSubtitle && !isVideo) {
    throw DomainError.notFound('MEDIA_FILE_NOT_FOUND', 'errors.notFound');
  }

  const abs = path.join(bundleDir, file);
  if (!existsSync(abs)) {
    throw DomainError.conflict('MEDIA_MISSING', 'errors.mediaMissing', {
      hint: 'bash scripts/generate-sample-media.sh',
    });
  }

  if (isMaster || isVariant) {
    // Playlist içi göreli yollar, playlist'in KENDİ dizinine göre çözülür:
    // master'daki varyant satırı '240p/playlist.m3u8', varyant içindeki
    // segment 'seg000.ts' (gerçekte 240p/seg000.ts) → relDir imzaya taşınır.
    const relDir = isVariant ? `${variantMatch![1]}/` : '';
    const signedPathOf = (relative: string): string => {
      const expSec = exp;
      const pathname = `${root}/${relDir}${relative}`;
      return `${base}${pathname}?token=${token}&exp=${expSec}`;
    };
    const rewriteLine = (line: string): string => {
      const trimmed = line.trimEnd();
      if (trimmed === '' || trimmed.startsWith('#')) {
        // Altyazı URI satırları (#EXT-X-MEDIA:...URI="subtitles/tr.vtt") da imzalanır.
        const uriMatch = /^#EXT-X-MEDIA:(.*)URI="([^"]+)"(.*)$/.exec(trimmed);
        if (uriMatch) {
          const inner = uriMatch[2]!;
          return `#EXT-X-MEDIA:${uriMatch[1]}URI="${signedPathOf(inner)}"${uriMatch[3]}`;
        }
        return trimmed;
      }
      return signedPathOf(trimmed);
    };
    const body = readFileSyncSafe(abs)
      .split('\n')
      .map(rewriteLine)
      .join('\n');
    return { contentType: 'application/vnd.apple.mpegurl', body };
  }
  if (isSubtitle) {
    return { contentType: 'text/vtt; charset=utf-8', filePath: abs };
  }
  if (isVideo) {
    return { contentType: 'video/mp4', filePath: abs, sizeBytes: statSync(abs).size };
  }
  return { contentType: 'video/mp2t', filePath: abs };
}

function readFileSyncSafe(p: string): string {
  return readFileSync(p, 'utf8');
}

function createWriteStreamSafe(target: string) {
  return createWriteStream(target, { flags: 'wx' });
}

function safeUnlink(target: string): void {
  try {
    if (existsSync(target)) unlinkSync(target);
  } catch {
    // temizlik hatası yutulur (yükleme hatası esas)
  }
}

/** ffprobe ile süre çözümleme (saniye, tam sayı). */
function probeDurationSeconds(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      file,
    ]);
    let out = '';
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const value = Number.parseFloat(out.trim());
      if (code === 0 && Number.isFinite(value) && value > 0) {
        resolve(Math.round(value));
      } else {
        reject(new Error('ffprobe süre çözümleyemedi'));
      }
    });
  });
}
