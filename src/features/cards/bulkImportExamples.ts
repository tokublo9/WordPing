import type { PromoSampleLang } from '../../lib/promoVoiceSamples';

/**
 * Display-only examples for the manual Bulk Import text box.
 *
 * This is a total table rather than translated UI copy: the selected language
 * comes from the persisted onboarding purpose and its corresponding live
 * Learning/Explanation Language, not from the app's UI locale. Keeping the
 * table total also means a missing locale cannot silently become English.
 */
export const BULK_IMPORT_EXAMPLES: Readonly<
  Record<PromoSampleLang, readonly [string, string, string]>
> = {
  en: ['apple', 'river', 'bright'],
  ja: ['りんご', '川', '明るい'],
  ko: ['사과', '강', '밝다'],
  zh: ['苹果', '河流', '明亮'],
  es: ['manzana', 'río', 'brillante'],
  fr: ['pomme', 'rivière', 'lumineux'],
  de: ['Apfel', 'Fluss', 'hell'],
  it: ['mela', 'fiume', 'luminoso'],
  pt: ['maçã', 'rio', 'brilhante'],
  ru: ['яблоко', 'река', 'яркий'],
  ar: ['تفاحة', 'نهر', 'مشرق'],
  hi: ['सेब', 'नदी', 'उज्ज्वल'],
  tr: ['elma', 'nehir', 'parlak'],
  nl: ['appel', 'rivier', 'helder'],
  vi: ['táo', 'sông', 'sáng'],
  th: ['แอปเปิล', 'แม่น้ำ', 'สว่าง'],
  id: ['apel', 'sungai', 'cerah'],
  pl: ['jabłko', 'rzeka', 'jasny'],
  el: ['μήλο', 'ποτάμι', 'φωτεινός'],
  sv: ['äpple', 'flod', 'ljus'],
};

/** Newlines are presentation only; this value is never assigned to input. */
export function bulkImportPlaceholder(language: PromoSampleLang): string {
  return BULK_IMPORT_EXAMPLES[language].join('\n');
}
