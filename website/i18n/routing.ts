import { defineRouting } from 'next-intl/routing';

export const locales = ['en', 'ja', 'ko', 'zh', 'es', 'fr', 'de', 'pt', 'vi', 'id', 'th', 'ar'] as const;
export type Locale = (typeof locales)[number];

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  th: 'ภาษาไทย',
  ar: 'العربية',
};

export const routing = defineRouting({
  locales,
  defaultLocale: 'en',
});
