/**
 * The promotional voice samples shown in the Upgrade Plan sheet.
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

export const PROMO_SAMPLE_IDS = ['spontaneous', 'vertical', 'merely', 'morning_light'] as const;
export type PromoSampleId = (typeof PROMO_SAMPLE_IDS)[number];

/** The twenty normalized keys shared by the text, audio and cache tables. */
export const PROMO_SAMPLE_LANGS = [
  'en', 'ja', 'ko', 'zh', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'ar', 'hi', 'tr', 'nl', 'vi', 'th', 'id', 'pl', 'el', 'sv',
] as const;
export type PromoSampleLang = (typeof PROMO_SAMPLE_LANGS)[number];

const PROMO_SAMPLE_LANG_SET: ReadonlySet<string> = new Set(PROMO_SAMPLE_LANGS);

// Covers the ordinary BCP-47 language/script/region/variant/extension forms the
// app can receive, including zh-Hans, zh-Hant-TW and zh-Hans-CN. Underscores,
// empty subtags and arbitrary path-like strings are invalid and fall back.
const BCP47_LANGUAGE_TAG = /^(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}(?:-[a-z]{4})?(?:-(?:[a-z]{2}|[0-9]{3}))?(?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*(?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*(?:-x(?:-[a-z0-9]{1,8})+)?|x(?:-[a-z0-9]{1,8})+)$/u;

/**
 * Identifies one generation of promotional audio.
 *
 * Bump it together with the Worker's copy whenever any of these changes:
 *
 *  - the sample text in the table below,
 *  - the voice, the model, or the pronunciation instructions,
 *  - the encoding of the bundled clips,
 *  - the fields that identify a promo clip in either cache.
 *
 * Bumping invalidates every clip the network route has cached, on the device and
 * in the Worker's KV, so nobody keeps hearing the previous take.
 *
 * Changes to spoken content or encoding also require regenerating the bundled
 * audio (a cache-only identity change does not):
 *
 *     npm run generate:promo-voice -- --force
 *
 * which rewrites `assets/promo-voice/<lang>/<sample>.mp3`, the static `require()`
 * map, and its generated version marker in `src/lib/promoVoiceAudio.ts`. Until
 * that marker matches this value, bundle lookup deliberately uses the corrected
 * network path instead of playing stale generated audio.
 */
export const PROMO_SAMPLE_VERSION = 'upgrade-promo-v3';

export const PROMO_SAMPLE_TEXT: Readonly<Record<PromoSampleId, Readonly<Record<PromoSampleLang, string>>>> = {
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
  vertical: {
    en: 'Vertical',
    ja: '垂直の',
    ko: '수직의',
    zh: '垂直的',
    es: 'Vertical',
    fr: 'Vertical',
    de: 'Vertikal',
    it: 'Verticale',
    pt: 'Vertical',
    ru: 'Вертикальный',
    ar: 'عمودي',
    hi: 'लंबवत',
    tr: 'Dikey',
    nl: 'Verticaal',
    vi: 'Thẳng đứng',
    th: 'แนวตั้ง',
    id: 'Vertikal',
    pl: 'Pionowy',
    el: 'Κατακόρυφος',
    sv: 'Vertikal',
  },
  merely: {
    en: 'Merely',
    ja: '単に',
    ko: '단지',
    zh: '仅仅',
    es: 'Simplemente',
    fr: 'Simplement',
    de: 'Lediglich',
    it: 'Semplicemente',
    pt: 'Apenas',
    ru: 'Всего лишь',
    ar: 'مجرد',
    hi: 'मात्र',
    tr: 'Yalnızca',
    nl: 'Slechts',
    vi: 'Chỉ đơn thuần',
    th: 'เพียง',
    id: 'Hanya',
    pl: 'Jedynie',
    el: 'Απλώς',
    sv: 'Enbart',
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

/** The supported base subtag for a valid BCP-47 tag, or `en`. Mirrors the Worker. */
export function resolvePromoLang(langCode: unknown): PromoSampleLang {
  if (typeof langCode !== 'string') return 'en';
  const tag = langCode.trim();
  const normalizedTag = tag.toLowerCase();
  if (!tag || normalizedTag === 'other' || !BCP47_LANGUAGE_TAG.test(normalizedTag)) return 'en';
  const base = normalizedTag.split('-')[0]!;
  return PROMO_SAMPLE_LANG_SET.has(base) ? base as PromoSampleLang : 'en';
}

/**
 * The text a sample speaks, for display and for the local cache key.
 *
 * Never sent to the Worker — it resolves the same value from its own table.
 */
export function promoSampleText(sample: PromoSampleId, langCode: string | undefined): string {
  const lang = resolvePromoLang(langCode);
  return PROMO_SAMPLE_TEXT[sample][lang];
}
