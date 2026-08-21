import { getRequestConfig } from 'next-intl/server';
import type { AbstractIntlMessages } from 'next-intl';
import { routing } from './routing';

interface Messages {
  [key: string]: string | Messages;
}

function mergeMessages(fallback: Messages, localized: Messages): Messages {
  const merged: Messages = { ...fallback };
  for (const [key, value] of Object.entries(localized)) {
    const fallbackValue = fallback[key];
    merged[key] = typeof value === 'object'
      && typeof fallbackValue === 'object'
      ? mergeMessages(fallbackValue, value)
      : value;
  }
  return merged;
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as typeof routing.locales[number])) {
    locale = routing.defaultLocale;
  }
  const english = (await import('../messages/en.json')).default as Messages;
  const localized = (await import(`../messages/${locale}.json`)).default as Messages;
  return { locale, messages: mergeMessages(english, localized) as AbstractIntlMessages };
});
