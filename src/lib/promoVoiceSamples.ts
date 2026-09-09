/**
 * The fixed voice samples: the Upgrade Plan sheet's four, and one preview per
 * offered voice for the Settings voice picker.
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

import { DEFAULT_AI_VOICE, type AIVoice } from './aiVoices';

export const PROMO_SAMPLE_IDS = [
  'spontaneous', 'vertical', 'merely', 'morning_light', 'voice_marin', 'voice_cedar',
] as const;
export type PromoSampleId = (typeof PROMO_SAMPLE_IDS)[number];

/** The four words and the sentence shown in the Upgrade Plan sheet. */
export const UPGRADE_PROMO_SAMPLE_IDS: readonly PromoSampleId[] = [
  'spontaneous', 'vertical', 'merely', 'morning_light',
];

/**
 * The voice-picker previews — one per offered voice.
 *
 * They are promo clips rather than `/v1/voice/sample` generations for three
 * reasons: they ship with the app, so the first tap is immediate and works
 * offline; the route they fall back to spends no credit and needs no
 * entitlement; and, unlike the old fixed English sentence, the words come from
 * the localized table below. The consent question in front of the tap is
 * unchanged — see `features/voice/voicePreviewFlow.ts`.
 */
export const VOICE_PROMO_SAMPLE_IDS: readonly PromoSampleId[] = ['voice_marin', 'voice_cedar'];

/**
 * Which sample each voice previews, and which voice speaks each sample.
 *
 * One table, read in both directions, so a preview can never be spoken by the
 * other voice: the sample id carries the voice identity into the local cache
 * key, the bundled asset path and the Worker's KV key.
 */
const VOICE_SAMPLE_ID_BY_VOICE = {
  marin: 'voice_marin',
  cedar: 'voice_cedar',
} as const satisfies Record<AIVoice, PromoSampleId>;

export function voiceSampleId(voice: AIVoice): PromoSampleId {
  return VOICE_SAMPLE_ID_BY_VOICE[voice];
}

/**
 * The voice a promo clip is spoken in. Mirrors the Worker's own table.
 *
 * The four marketing clips keep the default voice — they demonstrate the
 * feature, not a particular voice — and each picker preview is spoken by the
 * voice it previews.
 */
const PROMO_SAMPLE_VOICES: Readonly<Record<PromoSampleId, AIVoice>> = {
  spontaneous: DEFAULT_AI_VOICE,
  vertical: DEFAULT_AI_VOICE,
  merely: DEFAULT_AI_VOICE,
  morning_light: DEFAULT_AI_VOICE,
  voice_marin: 'marin',
  voice_cedar: 'cedar',
};

export function promoSampleVoice(sample: PromoSampleId): AIVoice {
  return PROMO_SAMPLE_VOICES[sample];
}

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
export const PROMO_SAMPLE_VERSION = 'upgrade-promo-v4';

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
  // The two picker previews. Each locale names the voice the way its dictionary
  // does (`voice_name_marin` / `voice_name_cedar`), so the sentence heard and
  // the name read on the row are the same name. No row is English by default:
  // a locale with no line here would be a silent English preview, which is the
  // bug these replaced.
  voice_marin: {
    en: 'This is Marin’s voice.',
    ja: 'これがマリンの声です。',
    ko: '이것이 마린의 목소리입니다.',
    zh: '这是马林的声音。',
    es: 'Esta es la voz de Marin.',
    fr: 'Voici la voix de Marin.',
    de: 'Das ist die Stimme von Marin.',
    it: 'Questa è la voce di Marin.',
    pt: 'Esta é a voz de Marin.',
    ru: 'Это голос Марин.',
    ar: 'هذا هو صوت مارين.',
    hi: 'यह मारिन की आवाज़ है।',
    tr: 'Bu, Marin’in sesi.',
    nl: 'Dit is de stem van Marin.',
    vi: 'Đây là giọng của Marin.',
    th: 'นี่คือเสียงของมาริน',
    id: 'Ini suara Marin.',
    pl: 'To jest głos Marin.',
    el: 'Αυτή είναι η φωνή της Μαρίν.',
    sv: 'Det här är Marins röst.',
  },
  voice_cedar: {
    en: 'This is Cedar’s voice.',
    ja: 'これがシダーの声です。',
    ko: '이것이 시더의 목소리입니다.',
    zh: '这是西达的声音。',
    es: 'Esta es la voz de Cedar.',
    fr: 'Voici la voix de Cedar.',
    de: 'Das ist die Stimme von Cedar.',
    it: 'Questa è la voce di Cedar.',
    pt: 'Esta é a voz de Cedar.',
    ru: 'Это голос Седара.',
    ar: 'هذا هو صوت سيدار.',
    hi: 'यह सीडर की आवाज़ है।',
    tr: 'Bu, Cedar’ın sesi.',
    nl: 'Dit is de stem van Cedar.',
    vi: 'Đây là giọng của Cedar.',
    th: 'นี่คือเสียงของซีดาร์',
    id: 'Ini suara Cedar.',
    pl: 'To jest głos Cedara.',
    el: 'Αυτή είναι η φωνή του Σίνταρ.',
    sv: 'Det här är Cedars röst.',
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
