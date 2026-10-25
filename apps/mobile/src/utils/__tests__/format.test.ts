/** Biçimlendirme yardımcıları testleri. */
import { describe, expect, it } from '@jest/globals';
import { formatDuration, formatMonthYear } from '../format';

describe('formatDuration', () => {
  it('dakikayı "12 dk" yazar', () => {
    expect(formatDuration(720)).toBe('12 dk');
  });

  it('saati "1 sa 12 dk" biçimine çevirir', () => {
    expect(formatDuration(4320)).toBe('1 sa 12 dk');
  });

  it('geçersiz girdide boş döner', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(-5)).toBe('');
    expect(formatDuration(Number.NaN)).toBe('');
  });
});

describe('formatMonthYear', () => {
  it('ISO tarihini ay-yıl biçimine çevirir', () => {
    const result = formatMonthYear('2025-03-14T10:00:00.000Z');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('');
  });

  it('geçersiz tarihte boş döner', () => {
    expect(formatMonthYear('bozuk-tarih')).toBe('');
  });
});
