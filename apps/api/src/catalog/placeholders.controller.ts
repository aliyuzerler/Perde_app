/**
 * Placeholder görsel servisi: telifsiz, deterministik SVG poster/hero/
 * dikey önizleme/banner üretir (seed verisi dış görsel kullanmaz).
 *
 *   GET /placeholders/:kind/:seed.svg?label=...
 * kind → en-boy oranı: poster 2:3, hero 16:9, vertical 9:16, banner 21:9.
 * Renk: seed hash'inden türetilen koyu sinematik palet (tema ile uyumlu).
 */
import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/guards';
import { RawResponse } from '../common/envelope.interceptor';

const DIMENSIONS: Record<string, { w: number; h: number }> = {
  poster: { w: 600, h: 900 }, // 2:3
  hero: { w: 1280, h: 720 }, // 16:9
  vertical: { w: 720, h: 1280 }, // 9:16
  banner: { w: 1680, h: 720 }, // 21:9
};

@ApiTags('placeholders')
@Public()
@Controller('placeholders')
export class PlaceholdersController {
  /** Deterministik SVG: aynı seed her zaman aynı görseli üretir. */
  @Get(':kind/:seed.svg')
  @ApiOperation({ summary: 'Deterministik telifsiz SVG placeholder (poster/hero/vertical/banner)' })
  @RawResponse()
  async get(
    @Param('kind') kind: string,
    @Param('seed') seed: string,
    @Query('label') label: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const dims = DIMENSIONS[kind] ?? { w: 600, h: 900 };
    const hue = parseInt(createHash('md5').update(`${kind}:${seed}`).digest('hex').slice(0, 4), 16) % 360;
    const hue2 = (hue + 40) % 360;
    const safeLabel = (label ?? seed)
      .slice(0, 42)
      .replace(/[<>&"']/g, '')
      .trim();

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${dims.w}" height="${dims.h}" viewBox="0 0 ${dims.w} ${dims.h}" role="img" aria-label="${safeLabel}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 45% 18%)"/>
      <stop offset="1" stop-color="hsl(${hue2} 55% 8%)"/>
    </linearGradient>
  </defs>
  <rect width="${dims.w}" height="${dims.h}" fill="#0D0D0F"/>
  <rect width="${dims.w}" height="${dims.h}" fill="url(#g)" opacity="0.85"/>
  <rect x="24" y="24" width="${dims.w - 48}" height="${dims.h - 48}" fill="none" stroke="hsl(${hue} 60% 55% / 0.35)" stroke-width="2"/>
  <circle cx="${dims.w / 2}" cy="${dims.h * 0.42}" r="${Math.min(dims.w, dims.h) * 0.14}" fill="hsl(${hue} 70% 42% / 0.55)"/>
  <path d="M ${dims.w / 2 - Math.min(dims.w, dims.h) * 0.05} ${dims.h * 0.42 - Math.min(dims.w, dims.h) * 0.07}
           L ${dims.w / 2 - Math.min(dims.w, dims.h) * 0.05} ${dims.h * 0.42 + Math.min(dims.w, dims.h) * 0.07}
           L ${dims.w / 2 + Math.min(dims.w, dims.h) * 0.08} ${dims.h * 0.42} Z"
        fill="#F5F1EA" opacity="0.9"/>
  <text x="50%" y="${dims.h * 0.78}" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(20, Math.round(dims.w / 24))}" fill="#F5F1EA" opacity="0.92">${safeLabel}</text>
</svg>`;

    res
      .status(200)
      .type('image/svg+xml')
      .set('Cache-Control', 'public, max-age=86400, immutable')
      .send(svg);
  }
}
