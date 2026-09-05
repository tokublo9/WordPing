/**
 * Server-controlled allowlists and limits.
 *
 * Everything a client could otherwise influence — model, upstream URL, voice,
 * input size — is pinned here. Client-supplied values for any of these are
 * ignored rather than merged: see `resolveVoice` and the route handlers.
 *
 * The numeric limits can be overridden at runtime from KV (`config:limits`)
 * so budgets can be tightened without shipping a new mobile build.
 */
export const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
export const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
export const REVENUECAT_API_BASE = 'https://api.revenuecat.com/v1';

/** The only models this proxy will ever ask OpenAI for. */
export const TEXT_MODEL = 'gpt-4o-mini';
export const SPEECH_MODEL = 'gpt-4o-mini-tts';

/**
 * Voice allowlist. Must stay a superset of the client's `AI_VOICES`
 * (src/lib/aiVoices.ts). Adding a voice to the app without adding it here
 * produces `invalid_voice` at runtime.
 */
export const VOICES = [
  'alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'fable',
  'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
] as const;
export type Voice = (typeof VOICES)[number];

const VOICE_SET: ReadonlySet<string> = new Set(VOICES);
export const DEFAULT_VOICE: Voice = 'marin';

/** Returns the requested voice only when it is on the allowlist. */
export function resolveVoice(requested: unknown): Voice | null {
  if (typeof requested !== 'string') return null;
  const normalized = requested.trim().toLowerCase();
  return VOICE_SET.has(normalized) ? (normalized as Voice) : null;
}

export const AUDIO_FORMATS = ['wav', 'mp3'] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

/** Every billable operation this Worker exposes. Used for kill switches too. */
export const FEATURES = [
  'voice_card', 'voice_sample', 'voice_promo', 'voice_custom', 'voice_credits',
  'meaning', 'breakdown', 'translation', 'example',
] as const;
export type Feature = (typeof FEATURES)[number];

export type Tier = 'free' | 'basic' | 'premium';

/**
 * Minimum entitlement tier required for each feature.
 *
 * `voice_promo` is the single 'free' entry and the only route that skips the
 * RevenueCat lookup. That is safe because the route accepts no text and no
 * voice: it serves fixed, server-authored clips that live in KV and are shared
 * by every caller, so the whole feature costs one OpenAI generation per clip per
 * cache lifetime no matter how many people play it. It is still subject to the
 * kill switch, the input cap and the per-minute and per-day rate limits.
 */
/**
 * Routes that accept no caller identity at all.
 *
 * A server-side constant keyed on the route, exactly like FEATURE_TIER: there
 * is no request field, header or body value that can reach it, so a caller
 * cannot ask to be treated as anonymous.
 *
 * Only the fixed promo previews qualify, and only because the request carries
 * nothing to attribute: no text, no voice, an allowlisted sample id and a language
 * code normalised against a fixed table. With no install id these are limited
 * by IP alone — see `planBuckets` — which is the only signal such a request has.
 *
 * Adding anything else here would remove the per-device limit from a route that
 * can be pointed at user content. Do not.
 */
export const ANONYMOUS_FEATURES: ReadonlySet<Feature> = new Set<Feature>(['voice_promo']);

export const FEATURE_TIER: Readonly<Record<Feature, Tier>> = {
  // High-Quality AI Voice is reachable on Basic and Premium, but on very
  // different terms, and this table only says who may knock. Premium is
  // unmetered. Basic spends a one-time grant of credits that never refills, and
  // an exhausted balance is refused in `approve` — see lifetimeCredits.ts. Free
  // cannot reach the route at all.
  //
  // The picker preview follows the card, because a plan that can use the voices
  // has to be able to hear them. It costs nothing extra: the sample sentence is
  // server-authored and the audio is cached in KV, so it is generated once for
  // everyone rather than once per subscriber, and it spends no credit.
  voice_card: 'basic',
  voice_sample: 'basic',
  voice_promo: 'free',
  voice_custom: 'premium',
  // Reads/initializes Basic's authoritative balance and confirms the paid tier.
  // It generates nothing and never reserves a credit.
  voice_credits: 'basic',
  meaning: 'premium',
  breakdown: 'premium',
  translation: 'premium',
  example: 'premium',
};

export interface FeatureLimits {
  /** Hard cap on a single request's input, in Unicode code points. */
  maxCharsPerRequest: number;
  maxRequestsPerMinute: number;
  maxRequestsPerDay: number;
  /** Total input characters allowed per rolling UTC day. */
  maxCharsPerDay: number;
}

type LimitTable = Readonly<Record<Feature, Readonly<Record<Tier, FeatureLimits>>>>;

const TEXT_LIMITS: Readonly<Record<Tier, FeatureLimits>> = {
  free: { maxCharsPerRequest: 0, maxRequestsPerMinute: 0, maxRequestsPerDay: 0, maxCharsPerDay: 0 },
  basic: { maxCharsPerRequest: 0, maxRequestsPerMinute: 0, maxRequestsPerDay: 0, maxCharsPerDay: 0 },
  premium: { maxCharsPerRequest: 500, maxRequestsPerMinute: 20, maxRequestsPerDay: 300, maxCharsPerDay: 50_000 },
};

const NO_ACCESS: FeatureLimits = {
  maxCharsPerRequest: 0, maxRequestsPerMinute: 0, maxRequestsPerDay: 0, maxCharsPerDay: 0,
};

/**
 * These short-term limits complement the separate monthly word-card allowance.
 * Voice generation is the expensive path and keeps the tightest limits.
 */
export const DEFAULT_LIMITS: LimitTable = {
  // Basic carries the same short-term abuse limits as Premium, deliberately.
  // What bounds Basic's cost is its one-time credit balance, not these. A tier
  // that may reach a route must have real limits here: NO_ACCESS means
  // `maxCharsPerRequest: 0`, which rejects every request as `input_too_long`
  // long before the credit ledger is consulted.
  voice_card: {
    free: NO_ACCESS,
    basic: { maxCharsPerRequest: 500, maxRequestsPerMinute: 20, maxRequestsPerDay: 300, maxCharsPerDay: 50_000 },
    premium: { maxCharsPerRequest: 500, maxRequestsPerMinute: 20, maxRequestsPerDay: 300, maxCharsPerDay: 50_000 },
  },
  voice_sample: {
    free: NO_ACCESS,
    basic: { maxCharsPerRequest: 120, maxRequestsPerMinute: 8, maxRequestsPerDay: 40, maxCharsPerDay: 4_000 },
    premium: { maxCharsPerRequest: 120, maxRequestsPerMinute: 8, maxRequestsPerDay: 40, maxCharsPerDay: 4_000 },
  },
  // Free by design; the tight per-minute and per-day caps are what stop the
  // route being used as an anonymous speech API. Every tier gets the same
  // budget because the response is the same shared cached object either way.
  voice_promo: {
    free:    { maxCharsPerRequest: 200, maxRequestsPerMinute: 6, maxRequestsPerDay: 30, maxCharsPerDay: 4_000 },
    basic:   { maxCharsPerRequest: 200, maxRequestsPerMinute: 6, maxRequestsPerDay: 30, maxCharsPerDay: 4_000 },
    premium: { maxCharsPerRequest: 200, maxRequestsPerMinute: 6, maxRequestsPerDay: 30, maxCharsPerDay: 4_000 },
  },
  voice_custom: {
    free: NO_ACCESS,
    basic: NO_ACCESS,
    premium: { maxCharsPerRequest: 1_000, maxRequestsPerMinute: 5, maxRequestsPerDay: 30, maxCharsPerDay: 15_000 },
  },
  voice_credits: {
    free: NO_ACCESS,
    basic: { maxCharsPerRequest: 0, maxRequestsPerMinute: 12, maxRequestsPerDay: 200, maxCharsPerDay: 0 },
    premium: { maxCharsPerRequest: 0, maxRequestsPerMinute: 12, maxRequestsPerDay: 200, maxCharsPerDay: 0 },
  },
  meaning: TEXT_LIMITS,
  breakdown: TEXT_LIMITS,
  translation: TEXT_LIMITS,
  example: TEXT_LIMITS,
};

/**
 * Absolute request-body ceiling, checked before the body is read so an
 * oversized upload is rejected without buffering it or calling OpenAI.
 * Generous enough for the largest allowed text plus JSON overhead.
 */
export const MAX_REQUEST_BODY_BYTES = 16 * 1024;

/** Refuse to relay an upstream audio response larger than this. */
export const MAX_AUDIO_RESPONSE_BYTES = 12 * 1024 * 1024;

/** Successful entitlement lookups are cached this long. */
export const ENTITLEMENT_CACHE_TTL_SECONDS = 300;
/**
 * Failures are cached far more briefly: a user who just subscribed must not be
 * locked out for minutes, and a RevenueCat blip must not become sticky.
 */
export const ENTITLEMENT_NEGATIVE_CACHE_TTL_SECONDS = 30;

/** Shared, non-personal voice previews. Cached server-side across all users. */
export const VOICE_SAMPLE_VERSION = 'natural-ai-voice-v2';
export const VOICE_SAMPLE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

export const VOICE_SAMPLE_TEXT: Readonly<Partial<Record<Voice, string>>> = {
  cedar: 'Welcome to WordCore. This is the Cedar voice.',
  fable: 'Welcome to WordCore. This is the Fable voice.',
  alloy: 'Welcome to WordCore. This is the Alloy voice.',
  ash: 'Welcome to WordCore. This is the Ash voice.',
  coral: 'Welcome to WordCore. This is the Coral voice.',
  nova: 'Welcome to WordCore. This is the Nova voice.',
  marin: 'Welcome to WordCore. This is the Marin voice.',
  shimmer: 'Welcome to WordCore. This is the Shimmer voice.',
};

/** Longest langCode we will even look at, so the map lookup cannot be abused. */
export const MAX_LANG_CODE_LENGTH = 16;

/**
 * Promotional voice previews for the Upgrade Plan sheet.
 *
 * These are the only speech clips a caller with no subscription can obtain, and
 * the request body cannot influence what is spoken: a client sends a sample id
 * from the fixed allowlist below plus a language code, and the text comes
 * from this table. There is no `text` field on the schema at all, so there is
 * no shape of request that turns this into a general speech API.
 *
 * The copy is identical to the text the sheet displays (src/lib/promoVoiceSamples.ts
 * in the app); a source test asserts the two tables agree, because audio that
 * does not match the words on screen is worse than no preview.
 */
export const PROMO_SAMPLE_IDS = ['spontaneous', 'vertical', 'merely', 'morning_light'] as const;
export type PromoSampleId = (typeof PROMO_SAMPLE_IDS)[number];

const PROMO_SAMPLE_ID_SET: ReadonlySet<string> = new Set(PROMO_SAMPLE_IDS);

export function isPromoSampleId(value: unknown): value is PromoSampleId {
  return typeof value === 'string' && PROMO_SAMPLE_ID_SET.has(value);
}

/** Fixed server-side. The client cannot choose a voice for a promo preview. */
export const PROMO_SAMPLE_VOICE: Voice = DEFAULT_VOICE;

/** Bump to invalidate every cached promo clip after a copy change. */
export const PROMO_SAMPLE_VERSION = 'upgrade-promo-v1';
export const PROMO_SAMPLE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

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

/** The base subtag this table has copy for, or 'en'. Never trusts the raw value. */
export function resolvePromoLang(langCode: unknown): string {
  if (typeof langCode !== 'string' || langCode.length > MAX_LANG_CODE_LENGTH) return 'en';
  const base = langCode.split(/[-_]/u)[0]?.toLowerCase() ?? '';
  return PROMO_SAMPLE_TEXT.spontaneous[base] !== undefined ? base : 'en';
}

/** The fixed text for a promo clip. Both arguments are already allowlisted. */
export function promoSampleText(sample: PromoSampleId, lang: string): string {
  return PROMO_SAMPLE_TEXT[sample][lang] ?? PROMO_SAMPLE_TEXT[sample].en as string;
}

export const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  en: 'English', 'en-US': 'English', es: 'Spanish', fr: 'French', ja: 'Japanese', ko: 'Korean',
  zh: 'Chinese', 'zh-CN': 'Chinese (Simplified)', de: 'German', it: 'Italian',
  pt: 'Portuguese', 'pt-BR': 'Portuguese',
  ru: 'Russian', ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', nl: 'Dutch', vi: 'Vietnamese',
  th: 'Thai', id: 'Indonesian', pl: 'Polish', el: 'Greek', sv: 'Swedish',
};
