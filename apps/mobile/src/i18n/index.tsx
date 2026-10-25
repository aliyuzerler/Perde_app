/**
 * Hafif i18n katmanı.
 *
 * - Varsayılan dil `tr`; `en` sözlüğü çoklu dile geçiş için hazır bekler.
 * - Anahtarlar nokta notasyonuyla girer: t('tabs.discover').
 * - Eksik anahtarda geliştirme modunda uyarı basılır ve anahtar adı döner;
 *   böylece eksik çeviri sessizce üretime sızmaz.
 * - `{{param}}` şeklinde basit parametre interpolasyonu desteklenir.
 */
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { tr, type TranslationDict } from './locales/tr';
import { en } from './locales/en';
import type { SupportedLocale } from '@perdego/contracts';

export const dictionaries = {
  tr,
  en,
} as const;

export type Dictionary = TranslationDict;

/** Sözlükteki tüm yaprak anahtar yolları ('common.retry' gibi). */
type Paths<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends string
        ? K
        : `${K}.${Paths<T[K]>}`;
    }[keyof T & string]
  : never;

export type TranslationKey = Paths<Dictionary>;

/** Nokta notasyonuyla derin sözlük araması. */
function lookup(dict: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (accumulator, part) =>
        accumulator && typeof accumulator === 'object'
          ? (accumulator as Record<string, unknown>)[part]
          : undefined,
      dict
    );
}

/** Yerel ayara göre çeviri fonksiyonu üretir (saf, test edilebilir). */
export function createTranslator(locale: SupportedLocale) {
  return function t(key: TranslationKey, params?: Record<string, string | number>): string {
    const dict = dictionaries[locale] ?? dictionaries.tr;
    const raw = lookup(dict, key);
    if (typeof raw !== 'string') {
      if (__DEV__) {
        console.warn(`[i18n] Eksik çeviri anahtarı: ${key} (${locale})`);
      }
      return key;
    }
    if (!params) {
      return raw;
    }
    return raw.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : `{{${name}}}`
    );
  };
}

export type Translator = ReturnType<typeof createTranslator>;

interface I18nContextValue {
  locale: SupportedLocale;
  t: Translator;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'tr',
  t: createTranslator('tr'),
});

interface I18nProviderProps {
  locale?: SupportedLocale;
  children: ReactNode;
}

export function I18nProvider({ locale = 'tr', children }: I18nProviderProps) {
  const value = useMemo(() => ({ locale, t: createTranslator(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

/** Yalnızca çeviri fonksiyonu gerektiren bileşenler için kısayol. */
export function useT(): Translator {
  return useI18n().t;
}
