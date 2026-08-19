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
  'voice_card', 'voice_sample', 'voice_custom',
  'meaning', 'breakdown', 'translation', 'example',
] as const;
export type Feature = (typeof FEATURES)[number];

export type Tier = 'free' | 'basic' | 'premium';

/** Minimum entitlement tier required for each feature. */
export const FEATURE_TIER: Readonly<Record<Feature, Exclude<Tier, 'free'>>> = {
  voice_card: 'basic',
  voice_sample: 'basic',
  voice_custom: 'premium',
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
 * There are no monthly counters: KV cannot hold a month of per-user state
 * cheaply, so the per-day budget plus the OpenAI project budget cover that
 * ceiling instead. Voice generation is the expensive path and keeps the
 * tightest limits.
 */
export const DEFAULT_LIMITS: LimitTable = {
  voice_card: {
    free: NO_ACCESS,
    basic: { maxCharsPerRequest: 300, maxRequestsPerMinute: 10, maxRequestsPerDay: 100, maxCharsPerDay: 15_000 },
    premium: { maxCharsPerRequest: 500, maxRequestsPerMinute: 20, maxRequestsPerDay: 300, maxCharsPerDay: 50_000 },
  },
  voice_sample: {
    free: NO_ACCESS,
    basic: { maxCharsPerRequest: 120, maxRequestsPerMinute: 8, maxRequestsPerDay: 40, maxCharsPerDay: 4_000 },
    premium: { maxCharsPerRequest: 120, maxRequestsPerMinute: 8, maxRequestsPerDay: 40, maxCharsPerDay: 4_000 },
  },
  voice_custom: {
    free: NO_ACCESS,
    basic: NO_ACCESS,
    premium: { maxCharsPerRequest: 1_000, maxRequestsPerMinute: 5, maxRequestsPerDay: 30, maxCharsPerDay: 15_000 },
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
export const VOICE_SAMPLE_VERSION = 'natural-ai-voice-v1';
export const VOICE_SAMPLE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

export const VOICE_SAMPLE_TEXT: Readonly<Partial<Record<Voice, string>>> = {
  cedar: 'Welcome to WordPing. This is the Cedar voice.',
  fable: 'Welcome to WordPing. This is the Fable voice.',
  alloy: 'Welcome to WordPing. This is the Alloy voice.',
  ash: 'Welcome to WordPing. This is the Ash voice.',
  coral: 'Welcome to WordPing. This is the Coral voice.',
  nova: 'Welcome to WordPing. This is the Nova voice.',
  marin: 'Welcome to WordPing. This is the Marin voice.',
  shimmer: 'Welcome to WordPing. This is the Shimmer voice.',
};

export const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  'en-US': 'English', es: 'Spanish', fr: 'French', ja: 'Japanese', ko: 'Korean',
  'zh-CN': 'Chinese (Simplified)', de: 'German', it: 'Italian', 'pt-BR': 'Portuguese',
  ru: 'Russian', ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', nl: 'Dutch', vi: 'Vietnamese',
  th: 'Thai', id: 'Indonesian', pl: 'Polish', el: 'Greek', sv: 'Swedish',
};

/** Longest langCode we will even look at, so the map lookup cannot be abused. */
export const MAX_LANG_CODE_LENGTH = 16;
