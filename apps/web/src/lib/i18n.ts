import { createI18n } from 'vue-i18n';
import en from '@/locales/en';
import es from '@/locales/es';
import { loadJson, saveJson } from './storage';

export const SUPPORTED_LOCALES = ['en', 'es'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_STORAGE_KEY = 'bill-splitter/locale/v1';

/** Names shown in the language picker, each in its own language. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español' };

function isLocale(value: unknown): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

/**
 * The language to show: the one the user picked, else the first of the
 * browser's preferred languages we support (`es-AR` → `es`), else English.
 */
export function detectLocale(
  preferred: readonly string[] = navigator.languages?.length
    ? navigator.languages
    : [navigator.language],
  saved: unknown = loadJson(LOCALE_STORAGE_KEY, isLocale),
): Locale {
  if (isLocale(saved)) return saved;
  for (const tag of preferred) {
    const language = tag.toLowerCase().split('-')[0];
    if (isLocale(language)) return language;
  }
  return 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { en, es },
});

document.documentElement.lang = i18n.global.locale.value;

/** The current language. */
export function currentLocale(): Locale {
  return i18n.global.locale.value as Locale;
}

/** Switches language and remembers the choice on this device. */
export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  saveJson(LOCALE_STORAGE_KEY, locale);
}

/** Translates outside components (e.g. in plain functions). */
export const t = i18n.global.t;
