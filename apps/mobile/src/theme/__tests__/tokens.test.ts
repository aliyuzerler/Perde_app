/**
 * Tasarım zorunluluklarının token düzeyinde koruması.
 * Bu testler, kural ihlali içeren bir token değişikliğini CI'da yakalar.
 */
import { describe, expect, it } from '@jest/globals';
import { colors, palette, radius, typography, ASPECT_RATIOS, layout } from '../tokens';

describe('marka paleti', () => {
  it('zorunlu marka renklerini içerir', () => {
    expect(palette.bg).toBe('#0D0D0F');
    expect(palette.surface).toBe('#19191D');
    expect(palette.accent).toBe('#B71C36');
    expect(palette.text).toBe('#F5F1EA');
  });
});

describe('köşe yarıçapı kuralı (0-4 px)', () => {
  it('tüm radius değerleri 0-4 aralığındadır', () => {
    for (const value of Object.values(radius)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(4);
    }
  });
});

describe('görsel oranları', () => {
  it('afiş 2:3, dikey 9:16, wide 16:9 oranındadır', () => {
    expect(ASPECT_RATIOS.poster).toBeCloseTo(2 / 3);
    expect(ASPECT_RATIOS.vertical).toBeCloseTo(9 / 16);
    expect(ASPECT_RATIOS.wide).toBeCloseTo(16 / 9);
  });
});

describe('erişilebilirlik', () => {
  it('minimum dokunma hedefi en az 44 birimdir', () => {
    expect(layout.minTouchTarget).toBeGreaterThanOrEqual(44);
  });
});

describe('renk token bütünlüğü', () => {
  it('text rengi marka sıcak beyazıdır ve danger marka kırmızısıyla aynıdır', () => {
    expect(colors.text).toBe(palette.text);
    expect(colors.danger).toBe(palette.accent);
  });
});

describe('tipografi', () => {
  it('display en büyük, label en küçük puntoya sahiptir', () => {
    expect(typography.display.fontSize).toBeGreaterThan(typography.title.fontSize);
    expect(typography.title.fontSize).toBeGreaterThan(typography.body.fontSize);
    expect(typography.body.fontSize).toBeGreaterThan(typography.label.fontSize);
  });
});
