/**
 * PerdeGo tasarım sistemi token'ları.
 * Kaynak doğruluk: docs/DESIGN.md. Değerleri buradan değiştirin,
 * bileşenlerde sabit renk/ölçü kullanmayın.
 */

/** Marka paleti (Tasarım Zorunlulukları). */
export const palette = {
  bg: '#0D0D0F',
  surface: '#19191D',
  accent: '#B71C36',
  text: '#F5F1EA',
} as const;

export const colors = {
  bg: palette.bg,
  surface: palette.surface,
  surfaceElevated: '#232328',
  surfacePressed: '#101013',
  accent: palette.accent,
  accentSoft: 'rgba(183, 28, 54, 0.18)',
  text: palette.text,
  textMuted: 'rgba(245, 241, 234, 0.64)',
  textSubtle: 'rgba(245, 241, 234, 0.4)',
  border: 'rgba(245, 241, 234, 0.08)',
  overlay: 'rgba(13, 13, 15, 0.6)',
  success: '#2E7D32',
  warning: '#C28A1D',
  danger: palette.accent,
} as const;

export type AppColor = keyof typeof colors;

/**
 * Köşe yarıçapı ZORUNLULUĞU: 0-4 px aralığı.
 * Bu aralığın dışına çıkan bir değer eklenemez (bkz. docs/DESIGN.md §2).
 */
export const radius = {
  none: 0,
  sm: 2,
  md: 4,
} as const;

export type AppRadius = keyof typeof radius;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
} as const;

export type AppSpacing = keyof typeof spacing;

/** Tipografi ölçeği (bkz. docs/DESIGN.md §4). */
export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const },
} as const;

export type TypographyVariant = keyof typeof typography;

/**
 * Görsel en-boy oranları (Tasarım Zorunlulukları):
 * afişler kesilmeden ve rastgele oranlara zorlanmadan gösterilir.
 */
export const ASPECT_RATIOS = {
  poster: 2 / 3, // w/h => h = w * 1.5
  vertical: 9 / 16,
  wide: 16 / 9,
} as const;

export type AspectRatioKey = keyof typeof ASPECT_RATIOS;

/** Yerleşim ölçüleri. */
export const layout = {
  screenPadding: spacing[4],
  railPosterWidth: 120,
  railVerticalWidth: 156,
  heroHeightRatio: 0.52,
  minTouchTarget: 44,
} as const;

export const theme = { colors, radius, spacing, typography, layout } as const;
export type Theme = typeof theme;
