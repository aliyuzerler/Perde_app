/**
 * FAZ 4 medya sözleşme testleri — oynatma oturumu, yükleme anahtarı ve
 * işleme durumu şemaları.
 */
import { describe, expect, it } from 'vitest';
import {
  playbackSessionSchema,
  mediaUploadTicketSchema,
  mediaUploadUrlRequestSchema,
  mediaStatusSchema,
  mediaListSchema,
  mediaTextTrackSchema,
  playbackSourcesSchema,
} from '../media';

const SIGNED = 'https://api.perdego.test/api/v1/media/hls/ep1/s1/master.m3u8?token=t&exp=9';

describe('faz 4 medya sözleşmeleri', () => {
  it('playbackSession imzalı URL + kaynak + altyazı taşır', () => {
    const session = playbackSessionSchema.parse({
      episodeId: 'ep1',
      provider: 'LOCAL',
      playbackUrl: SIGNED,
      sources: { hls: SIGNED, mp4: 'https://api.perdego.test/api/v1/media/stream/ep1/s1/video.mp4?token=t&exp=9' },
      expiresAt: '2026-01-01T00:00:00.000Z',
      positionSeconds: 42,
      quality: ['240p', '360p', '540p'],
      guest: false,
      textTracks: [
        { language: 'tr', label: 'Türkçe', url: 'https://api.perdego.test/subtitles/tr.vtt?token=t', isDefault: true },
      ],
    });
    expect(session.textTracks).toHaveLength(1);
    expect(session.sources.mp4).toContain('video.mp4');
  });

  it('playbackSession textTracks alanı zorunlu değildir (varsayılan boş)', () => {
    const session = playbackSessionSchema.parse({
      episodeId: 'ep1',
      provider: 'LOCAL',
      playbackUrl: SIGNED,
      sources: {},
      expiresAt: '2026-01-01T00:00:00.000Z',
      positionSeconds: 0,
      quality: [],
      guest: true,
    });
    expect(session.textTracks).toEqual([]);
  });

  it('playbackSession kalıcı olmayan URL kurallarını bozan sağlayıcıyı reddeder', () => {
    // playbackUrl http(s) URL olmak zorundadır; göreli yol geçersizdir.
    expect(() =>
      playbackSessionSchema.parse({
        episodeId: 'ep1',
        provider: 'LOCAL',
        playbackUrl: '/media/hls/master.m3u8',
        sources: {},
        expiresAt: 'x',
        positionSeconds: 0,
        quality: [],
        guest: true,
      })
    ).toThrow();
  });

  it('mediaUploadTicket PUT + süre bilgisi taşır', () => {
    const ticket = mediaUploadTicketSchema.parse({
      mediaId: 'm1',
      provider: 'LOCAL',
      uploadUrl: 'https://api.perdego.test/api/v1/media/upload/m1?token=t&exp=9',
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      maxSizeBytes: 536870912,
      expiresAt: '2026-01-01T00:15:00.000Z',
    });
    expect(ticket.method).toBe('PUT');
    expect(ticket.headers['Content-Type']).toBe('video/mp4');
  });

  it('mediaUploadTicket method yalnızca PUT olabilir', () => {
    expect(() =>
      mediaUploadTicketSchema.parse({
        mediaId: 'm1',
        provider: 'LOCAL',
        uploadUrl: 'https://api.perdego.test/x?token=t',
        method: 'POST',
        headers: {},
        maxSizeBytes: 1,
        expiresAt: 'x',
      })
    ).toThrow();
  });

  it('mediaUploadUrlRequest gövdesi opsiyoneldir ama MIME biçimi denetlenir', () => {
    expect(mediaUploadUrlRequestSchema.parse({})).toEqual({});
    expect(mediaUploadUrlRequestSchema.parse({ originalName: 'bolum1.mp4', contentType: 'video/mp4' })).toMatchObject({
      contentType: 'video/mp4',
    });
    expect(() => mediaUploadUrlRequestSchema.parse({ contentType: 'videomp4' })).toThrow();
  });

  it('mediaStatus işleme durumunu ve playbackReady bayrağını taşır', () => {
    const status = mediaStatusSchema.parse({
      mediaId: 'm1',
      episodeId: 'ep1',
      provider: 'LOCAL',
      state: 'READY',
      durationSeconds: 12,
      sizeBytes: 1_048_576,
      errorMessage: null,
      originalName: 'sample.mp4',
      playbackReady: true,
      textTracks: [{ language: 'tr', label: 'Türkçe', isDefault: true }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(status.playbackReady).toBe(true);
    expect(status.textTracks[0]!.isDefault).toBe(true);
  });

  it('mediaList boş liste kabul eder', () => {
    expect(mediaListSchema.parse({ items: [] }).items).toEqual([]);
    expect(mediaListSchema.parse({}).items).toEqual([]);
  });

  it('mediaTextTrack dil etiketi zorunludur', () => {
    expect(() =>
      mediaTextTrackSchema.parse({ label: 'Türkçe', url: 'https://x/y.vtt' })
    ).toThrow();
  });

  it('playbackSources en az bir kaynak alanı opsiyonel kabul eder', () => {
    expect(playbackSourcesSchema.parse({})).toEqual({});
    expect(() => playbackSourcesSchema.parse({ hls: 'not-a-url' })).toThrow();
  });
});
