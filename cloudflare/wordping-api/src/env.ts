/**
 * Worker bindings.
 *
 * Everything in here that is a secret arrives via `wrangler secret put` and is
 * never present in wrangler.toml, source control, or any client bundle.
 */
export interface Env {
  /** Secret. OpenAI project API key. */
  OPENAI_API_KEY: string;
  /** Secret. RevenueCat *secret* (sk_) key — not the public SDK key. */
  REVENUECAT_SECRET_API_KEY: string;
  /**
   * Secret, optional. Salt for the privacy-preserving identity hashes used as
   * rate-limit keys. Rotating it resets every counter. If unset the hashes are
   * unsalted and therefore brute-forceable by anyone who can read the KV
   * namespace — set it in production.
   */
  RATE_LIMIT_SALT?: string;

  /** Rate-limit counters, entitlement cache, kill switches, voice-sample cache. */
  WORDPING_KV: KVNamespace;

  ALLOWED_ORIGINS?: string;
  ENTITLEMENT_BASIC?: string;
  ENTITLEMENT_PREMIUM?: string;
  OPENAI_TEXT_TIMEOUT_MS?: string;
  OPENAI_SPEECH_TIMEOUT_MS?: string;
  REVENUECAT_TIMEOUT_MS?: string;
  DEV_BYPASS_ENTITLEMENTS?: string;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export interface ResolvedEnv {
  entitlementBasic: string;
  entitlementPremium: string;
  textTimeoutMs: number;
  speechTimeoutMs: number;
  revenueCatTimeoutMs: number;
  allowedOrigins: readonly string[];
  devBypassEntitlements: boolean;
}

/**
 * Reads the non-secret tunables once per request. Values are validated here so
 * a typo in `[vars]` degrades to the documented default instead of NaN.
 */
export function resolveEnv(env: Env): ResolvedEnv {
  return {
    entitlementBasic: env.ENTITLEMENT_BASIC?.trim() || 'basic',
    entitlementPremium: env.ENTITLEMENT_PREMIUM?.trim() || 'premium',
    textTimeoutMs: positiveInt(env.OPENAI_TEXT_TIMEOUT_MS, 25_000),
    speechTimeoutMs: positiveInt(env.OPENAI_SPEECH_TIMEOUT_MS, 50_000),
    revenueCatTimeoutMs: positiveInt(env.REVENUECAT_TIMEOUT_MS, 5_000),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map(origin => origin.trim())
      .filter(origin => origin.length > 0),
    devBypassEntitlements: env.DEV_BYPASS_ENTITLEMENTS === '1',
  };
}
