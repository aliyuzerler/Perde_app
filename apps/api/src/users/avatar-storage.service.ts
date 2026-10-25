/**
 * Profil fotoğrafı altyapısı (Faz 3b).
 *
 * Depolama kararı: bu fazda yerel disk (UPLOAD_DIR/avatars); CDN/S3 görsel
 * yayın fazında VideoProviderAdapter ile aynı soyutlamaya taşınır (bilinçli
 * sınır, raporda belgeli). Dosya adı rastgele UUID'dir (path traversal +
 * tahminleme yok); MIME yalnızca beyaz liste + magic byte doğrulaması.
 *
 * Servis edilen URL: {origin}/uploads/avatars/<name> — bootstrap'taki
 * express.static /uploads kökünü yayınlar (public, cache'lenebilir).
 */
import { Inject, Injectable } from '@nestjs/common';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { DomainError } from '../common/errors';

/** Kabul edilen görsel türleri: magic byte imzalarıyla doğrulanır. */
const SIGNATURES: Array<{ mime: 'image/jpeg' | 'png' | 'webp'; ext: string; test: (b: Buffer) => boolean }> = [
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'png',
    ext: 'png',
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    mime: 'webp',
    ext: 'webp',
    test: (b) =>
      b.length >= 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
];

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

export interface SavedAvatar {
  fileName: string;
  absolutePath: string;
  publicPath: string; // /uploads/avatars/<name>
}

@Injectable()
export class AvatarStorageService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Ham gövdeyi doğrular ve diske yazar. Hatalar: 400 (biçim/boyut). */
  save(buffer: Buffer, declaredMime: string | undefined): SavedAvatar {
    if (!buffer || buffer.length === 0) {
      throw DomainError.badRequest('AVATAR_EMPTY', 'errors.avatarInvalid');
    }
    if (buffer.length > MAX_AVATAR_BYTES) {
      throw DomainError.badRequest('AVATAR_TOO_LARGE', 'errors.avatarTooLarge');
    }
    const signature = SIGNATURES.find((s) => s.test(buffer));
    if (!signature) {
      throw DomainError.badRequest('AVATAR_INVALID_FORMAT', 'errors.avatarInvalid');
    }
    // Beyaz liste çapraz teyidi: istemci content-type'ı tamamen farklıysa reddet
    // (image/* gevşek kabulü: jpeg pipelines'ta image/jpg, image/pjpeg varyantları).
    if (declaredMime && !isCompatibleMime(declaredMime, signature.mime)) {
      throw DomainError.badRequest('AVATAR_INVALID_FORMAT', 'errors.avatarInvalid');
    }

    const dir = resolve(process.cwd(), this.env.UPLOAD_DIR, 'avatars');
    mkdirSync(dir, { recursive: true });
    const fileName = `${randomUUID()}.${signature.ext}`;
    const absolutePath = resolve(dir, fileName);
    writeFileSync(absolutePath, buffer, { flag: 'wx' });

    return {
      fileName,
      absolutePath,
      publicPath: `/uploads/avatars/${fileName}`,
    };
  }

  /** Kaydı siler; dosya yoksa sessizce geçer. */
  remove(fileNameOrUrl: string): void {
    let name = fileNameOrUrl;
    const marker = '/uploads/avatars/';
    const idx = fileNameOrUrl.indexOf(marker);
    if (idx !== -1) {
      name = fileNameOrUrl.slice(idx + marker.length).split(/[?#]/)[0]!;
    }
    // Yalnızca güvenli dosya adı deseni kabul edilir (path traversal engeli).
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return;
    const absolutePath = resolve(process.cwd(), this.env.UPLOAD_DIR, 'avatars', name);
    if (existsSync(absolutePath)) {
      unlinkSync(absolutePath);
    }
  }
}

function isCompatibleMime(declared: string, expected: string): boolean {
  const d = declared.toLowerCase().split(';')[0]!.trim();
  if (!d.startsWith('image/')) return false;
  if (expected === 'png') return d === 'image/png';
  if (expected === 'webp') return d === 'image/webp';
  return ['image/jpeg', 'image/jpg', 'image/pjpeg'].includes(d);
}
