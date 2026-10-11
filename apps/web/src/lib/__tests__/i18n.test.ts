import { afterEach, describe, expect, it } from 'vitest';
import { detectLocale, i18n, LOCALE_STORAGE_KEY, setLocale } from '../i18n';
import en from '@/locales/en';
import es from '@/locales/es';

function keys(messages: object, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'object' ? keys(value as object, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

describe('detectLocale', () => {
  it('picks the first supported browser language', () => {
    expect(detectLocale(['es-AR', 'en-US'], null)).toBe('es');
    expect(detectLocale(['fr-FR', 'es-ES'], null)).toBe('es');
    expect(detectLocale(['en-GB'], null)).toBe('en');
  });

  it('falls back to English', () => {
    expect(detectLocale(['fr-FR', 'de'], null)).toBe('en');
    expect(detectLocale([], null)).toBe('en');
  });

  it("prefers the user's own choice", () => {
    expect(detectLocale(['es-ES'], 'en')).toBe('en');
    expect(detectLocale(['en-US'], 'xx')).toBe('en');
  });
});

describe('setLocale', () => {
  afterEach(() => {
    setLocale('en');
    window.localStorage.clear();
  });

  it('switches language, updates the page and remembers the choice', () => {
    setLocale('es');
    expect(i18n.global.t('summary.title')).toBe('El reparto');
    expect(document.documentElement.lang).toBe('es');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('"es"');
  });

  it('picks plural forms', () => {
    setLocale('es');
    expect(i18n.global.t('common.people', { n: 1 }, 1)).toBe('1 persona');
    expect(i18n.global.t('common.people', { n: 3 }, 3)).toBe('3 personas');
  });
});

describe('locales', () => {
  it('translate every key, with the same placeholders', () => {
    const english = keys(en);
    expect(keys(es).sort()).toEqual([...english].sort());
    const lookup = (messages: object, key: string) =>
      key
        .split('.')
        .reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)[part],
          messages,
        ) as string;
    for (const key of english) {
      const placeholders = (text: string) =>
        [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(placeholders(lookup(es, key)), key).toEqual(placeholders(lookup(en, key)));
    }
  });
});
