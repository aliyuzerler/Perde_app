/**
 * AvatarStorageService birim testleri — magic byte doğrulaması, boyut sınırı,
 * MIME uyumu ve path traversal engeli.
 */
import { describe, expect, it, afterAll } from 'vitest';
import { mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AvatarStorageService, MAX_AVATAR_BYTES } from './avatar-storage.service';
import { DomainError } from '../common/errors';
import type { Env } from '../config/env.schema';

const PNG_1PX = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082',
  'hex',
);
const JPEG_HEADER = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 0)]);
const WEBP_HEADER = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4, 0), Buffer.from('WEBP'), Buffer.alloc(16, 0)]);

const uploadRoot = mkdtempSync(join(tmpdir(), 'perdego-avatars-'));

const service = new AvatarStorageService({ UPLOAD_DIR: uploadRoot } as unknown as Env);

afterAll(() => {
  rmSync(uploadRoot, { recursive: true, force: true });
});

describe('AvatarStorageService', () => {
  it('PNG kabul eder ve rastgele adla kaydeder', () => {
    const saved = service.save(PNG_1PX, 'image/png');
    expect(saved.publicPath).toMatch(/^\/uploads\/avatars\/[A-Za-z0-9-]+\.png$/);
    expect(existsSync(saved.absolutePath)).toBe(true);
  });

  it('JPEG ve WebP imzalarını tanır; bildirilen MIME ile uyum ister', () => {
    expect(service.save(JPEG_HEADER, 'image/jpeg').publicPath).toMatch(/\.jpg$/);
    expect(service.save(WEBP_HEADER, 'image/webp').publicPath).toMatch(/\.webp$/);
    // MIME çapraz uyumsuz: PNG gövde + jpeg bildirimi → 400
    expect(() => service.save(PNG_1PX, 'image/jpeg')).toThrowError(DomainError);
    // Görüntü olmayan MIME → 400
    expect(() => service.save(PNG_1PX, 'text/plain')).toThrowError(DomainError);
    // MIME verilmezse yalnızca imza konuşur
    expect(service.save(PNG_1PX, undefined).publicPath).toMatch(/\.png$/);
  });

  it('imza dışı gövde, boş gövde ve taşan boyut reddedilir', () => {
    expect(() => service.save(Buffer.from('düz metin'), 'image/png')).toThrowError(DomainError);
    expect(() => service.save(Buffer.alloc(0), 'image/png')).toThrowError(DomainError);
    expect(() => service.save(Buffer.alloc(MAX_AVATAR_BYTES + 1, 0x89), 'image/png')).toThrowError(DomainError);
  });

  it('remove yalnızca güvenli dosya adlarını siler;avatars dizini sızdırılamaz', () => {
    const saved = service.save(PNG_1PX, 'image/png');
    expect(existsSync(saved.absolutePath)).toBe(true);

    service.remove(saved.publicPath);
    expect(existsSync(saved.absolutePath)).toBe(false);

    // Path traversal denemeleri sessizce yok sayılır (dosya silinmez).
    const survivor = service.save(PNG_1PX, 'image/png');
    service.remove('../../etc/passwd');
    service.remove('/uploads/avatars/..%2f..%2fsecret.png');
    expect(existsSync(survivor.absolutePath)).toBe(true);

    // avatarUrl üzerinden silme de çalışır.
    service.remove(`https://api.perdego.app${survivor.publicPath}?v=2`);
    expect(existsSync(survivor.absolutePath)).toBe(false);
  });

  it('aynı dizine ardışık kayıtlar çakışmaz (wx bayrağı + UUID)', () => {
    const a = service.save(PNG_1PX, 'image/png');
    const b = service.save(PNG_1PX, 'image/png');
    expect(a.fileName).not.toBe(b.fileName);
    expect(readdirSync(join(uploadRoot, 'avatars')).length).toBeGreaterThanOrEqual(2);
  });
});
