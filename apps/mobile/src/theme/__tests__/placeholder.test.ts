/**
 * Özgün placeholder üretiminin determinizm ve marka uyum testleri.
 */
import { describe, expect, it } from '@jest/globals';
import {
  getMonogram,
  getPlaceholderStyle,
  hashSeed,
} from '../placeholder';

describe('hashSeed', () => {
  it('aynı girdi için aynı değeri üretir', () => {
    expect(hashSeed('Kum Saati Protokolü')).toBe(hashSeed('Kum Saati Protokolü'));
  });

  it('farklı girdiler için (büyük olasılıkla) farklı değer üretir', () => {
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });
});

describe('getPlaceholderStyle', () => {
  it('deterministiktir: aynı başlık aynı stili verir', () => {
    const first = getPlaceholderStyle('Gece Yarısı Konseri');
    const second = getPlaceholderStyle('Gece Yarısı Konseri');
    expect(first).toEqual(second);
  });

  it('gradyan koyu zemin tonlarından seçilir (marka paleti uyumlu)', () => {
    const style = getPlaceholderStyle('Son Vapur');
    const darkSurfaces = ['#0D0D0F', '#101013'];
    expect(darkSurfaces).toContain(style.gradientColors[1]);
  });

  it('monogram rengi opaklık içeren rgba biçimindedir', () => {
    const style = getPlaceholderStyle('Kırık Sekiz');
    expect(style.monogramColor).toMatch(/^rgba\(/);
  });
});

describe('getMonogram', () => {
  it('iki kelimelik başlıkta baş harfleri birleştirir', () => {
    expect(getMonogram('Kum Saati')).toBe('KS');
  });

  it('üç ve daha fazla kelimede en çok iki harf kullanır', () => {
    expect(getMonogram('PerdeGo Bir İki Üç')).toBe('PB');
  });

  it('boş başlıkta varsayılan harfi verir', () => {
    expect(getMonogram('   ')).toBe('P');
  });
});
