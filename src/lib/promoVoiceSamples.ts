/**
 * The two promotional voice samples shown in the Upgrade Plan sheet.
 *
 * Free users can play these; they are the only speech the app produces without
 * a subscription. That is safe because the Worker owns the words: the app sends
 * a sample id and a language code to `/v1/voice/promo`, never any text, and the
 * Worker looks the sentence up in its own copy of this table. Playing a preview
 * unlocks nothing else — word-card AI voice still requires an entitlement.
 *
 * The Worker's copy lives in `cloudflare/wordping-api/src/config.ts`. A source
 * test asserts the two agree, because audio that does not match the words on
 * screen is worse than no preview at all.
 *
 * Pure module: no react-native or expo imports, so it is unit-tested directly.
 */

export const PROMO_SAMPLE_IDS = ['spontaneous', 'morning_light'] as const;
export type PromoSampleId = (typeof PROMO_SAMPLE_IDS)[number];

/** Bump together with the Worker's PROMO_SAMPLE_VERSION when the copy changes. */
export const PROMO_SAMPLE_VERSION = 'upgrade-promo-v1';

export const PROMO_SAMPLE_TEXT: Readonly<Record<PromoSampleId, Readonly<Record<string, string>>>> = {
  spontaneous: {
    en: 'Spontaneous',
    ja: '自発的',
    ko: '자연스러운',
    zh: '自发的',
    es: 'Espontáneo',
    fr: 'Spontané',
    de: 'Spontan',
    it: 'Spontaneo',
    pt: 'Espontâneo',
    ru: 'Спонтанный',
    ar: 'عفوي',
    hi: 'स्वतःस्फूर्त',
    tr: 'Kendiliğinden',
    nl: 'Spontaan',
    vi: 'Ngẫu hứng',
    th: 'โดยธรรมชาติ',
    id: 'Spontan',
    pl: 'Spontaniczny',
    el: 'Αυθόρμητος',
    sv: 'Spontan',
  },
  morning_light: {
    en: 'The morning light filtered through the trees.',
    ja: '朝の光が木々の間から差し込んでいた。',
    ko: '아침 햇살이 나무 사이로 스며들었다.',
    zh: '清晨的阳光透过树木洒落下来。',
    es: 'La luz de la mañana se filtraba entre los árboles.',
    fr: 'La lumière du matin filtrait à travers les arbres.',
    de: 'Das Morgenlicht drang durch die Bäume.',
    it: 'La luce del mattino filtrava tra gli alberi.',
    pt: 'A luz da manhã filtrava-se pelas árvores.',
    ru: 'Утренний свет проникал сквозь деревья.',
    ar: 'تسرَّب ضوء الصباح عبر الأشجار.',
    hi: 'सुबह की रोशनी पेड़ों के बीच से छनकर आ रही थी।',
    tr: 'Sabah ışığı ağaçların arasından süzülüyordu.',
    nl: 'Het ochtendlicht filterde door de bomen.',
    vi: 'Ánh sáng ban mai lọc qua tán cây.',
    th: 'แสงเช้ากรองผ่านต้นไม้อย่างงดงาม',
    id: 'Cahaya pagi menyaring melalui pepohonan.',
    pl: 'Poranne światło przesączało się przez drzewa.',
    el: 'Το πρωινό φως διαπερνούσε τα δέντρα.',
    sv: 'Morgonljuset filtrerades genom träden.',
  },
};

export function isPromoSampleId(value: unknown): value is PromoSampleId {
  return typeof value === 'string' && (PROMO_SAMPLE_IDS as readonly string[]).includes(value);
}

/** The base subtag this table has copy for, or 'en'. Mirrors the Worker. */
export function resolvePromoLang(langCode: string | undefined): string {
  if (!langCode || langCode === 'other') return 'en';
  const base = langCode.split(/[-_]/u)[0]?.toLowerCase() ?? '';
  return PROMO_SAMPLE_TEXT.spontaneous[base] !== undefined ? base : 'en';
}

/**
 * The text a sample speaks, for display and for the local cache key.
 *
 * Never sent to the Worker — it resolves the same value from its own table.
 */
export function promoSampleText(sample: PromoSampleId, langCode: string | undefined): string {
  const lang = resolvePromoLang(langCode);
  return PROMO_SAMPLE_TEXT[sample][lang] ?? (PROMO_SAMPLE_TEXT[sample].en as string);
}
