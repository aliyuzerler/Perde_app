/**
 * i18n katmanı testleri: noktalı anahtar çözümleme, parametre interpolasyonu,
 * eksik anahtar davranışı ve tr/en yapı eşiti.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { createTranslator, dictionaries } from '../index';

describe('createTranslator (tr)', () => {
  const t = createTranslator('tr');

  it('bir seviye derinlikteki anahtarı çözer', () => {
    expect(t('tabs.discover')).toBe('Keşfet');
  });

  it('iki seviye derinlikteki anahtarı çözer', () => {
    expect(t('watchlist.emptyTitle')).toBe('Listen henüz boş');
  });

  it('parametre interpolasyonu yapar', () => {
    const result = t('search.noResultsBody', { query: 'gerilim' });
    expect(result).toContain('gerilim');
    expect(result).not.toContain('{{query}}');
  });

  it('erişim etiketlerini döner', () => {
    expect(t('access.FREE')).toBe('Ücretsiz');
    expect(t('access.SUBSCRIPTION')).toBe('Üyelere özel');
    expect(t('access.CREDIT')).toBe('Kredi ile');
  });

  it('eksik anahtarda uyarı basar ve anahtarı döner', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = t('yok.boyleBirAnahtar' as never);
    expect(missing).toBe('yok.boyleBirAnahtar');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('createTranslator (en iskeleti)', () => {
  const t = createTranslator('en');

  it('en sözlüğünden okur', () => {
    expect(t('tabs.discover')).toBe('Discover');
  });

  it('tr sözlüğüyle aynı anahtar yapısına sahiptir (JSON derinlik eşiti)', () => {
    const collect = (node: unknown, prefix = ''): string[] => {
      if (typeof node === 'string') {
        return [prefix];
      }
      return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
        collect(value, prefix ? `${prefix}.${key}` : key)
      );
    };
    const trKeys = collect(dictionaries.tr).sort();
    const enKeys = collect(dictionaries.en).sort();
    expect(enKeys).toEqual(trKeys);
  });
});
