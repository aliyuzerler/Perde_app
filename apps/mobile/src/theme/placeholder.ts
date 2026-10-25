/**
 * Özgün placeholder görsel üretimi.
 *
 * Telifli yapımlara ait gerçek afişler KULLANILMAZ. Poster/önizleme alanında
 * kaynak görsel yoksa, başlık metninden türetilen deterministik sinematik
 * gradyan + baş harf kombinasyonu gösterilir. Aynı başlık her zaman aynı
 * görünümü üretir (test edilebilir, tutarlı).
 */
import type { ViewStyle } from 'react-native';

interface PlaceholderStyle {
  gradientColors: [string, string];
  accentTint: string;
  /** Büyük baş harf bloğunun rengi. */
  monogramColor: string;
}

/** Paletle uyumlu, sinematik ve düşük doygunluklu ikili gradyanlar. */
const GRADIENT_PAIRS: readonly [string, string][] = [
  ['#232328', '#0D0D0F'],
  ['#1E1A1C', '#0D0D0F'],
  ['#19191D', '#101013'],
  ['#26221A', '#0D0D0F'],
  ['#1A2226', '#0D0D0F'],
  ['#221A20', '#101013'],
];

/** Çok hafif marka tonu katmanları (doygunluk bilinçli düşük). */
const ACCENT_TINTS: readonly string[] = [
  'rgba(183, 28, 54, 0.16)',
  'rgba(183, 28, 54, 0.08)',
  'rgba(90, 96, 120, 0.12)',
  'rgba(160, 130, 90, 0.10)',
];

const MONOGRAM_COLORS: readonly string[] = [
  'rgba(245, 241, 234, 0.22)',
  'rgba(245, 241, 234, 0.16)',
  'rgba(183, 28, 54, 0.30)',
];

/** Basit ve deterministik dize hash'i (FNV-1a). */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Başlıktan deterministik placeholder stili üretir. */
export function getPlaceholderStyle(seed: string): PlaceholderStyle {
  const hash = hashSeed(seed);
  const pair = GRADIENT_PAIRS[hash % GRADIENT_PAIRS.length]!;
  const tint = ACCENT_TINTS[hash % ACCENT_TINTS.length]!;
  const monogram = MONOGRAM_COLORS[hash % MONOGRAM_COLORS.length]!;
  return {
    gradientColors: [pair[0], pair[1]],
    accentTint: tint,
    monogramColor: monogram,
  };
}

/** Başlığın baş harflerinden monogram üretir (en çok 2 harf). */
export function getMonogram(title: string): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return 'P';
  }
  const initials = words
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase('tr-TR'))
    .join('');
  return initials;
}

/** Placeholder görselinin kapsayıcı stili. */
export function placeholderContainerStyle(borderRadius: number): ViewStyle {
  return {
    backgroundColor: '#0D0D0F',
    borderRadius,
    overflow: 'hidden',
  };
}
