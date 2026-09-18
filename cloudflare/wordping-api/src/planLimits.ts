import type { Feature, Tier } from './config';

/**
 * Plan limits — the authoritative copy.
 *
 * Enforced here, in the Worker, after the caller's tier has been verified
 * against RevenueCat. The app mirrors these in src/lib/planLimits.ts purely for
 * display; a test asserts the two agree.
 *
 * A client-supplied plan name or usage count is never read anywhere in this
 * Worker. The tier used below always comes from `resolveEntitlement`.
 */

/**
 * Features covered by the *monthly* High-Quality AI Voice allowance.
 *
 * Premium card generations use the monthly budget. Basic's allowance is a
 * one-time card grant in lifetimeCredits.ts and does not reset monthly.
 */
export const VOICE_QUOTA_FEATURES: readonly Feature[] = ['voice_card'];

export function isVoiceQuotaFeature(feature: Feature): boolean {
  return VOICE_QUOTA_FEATURES.includes(feature);
}

/**
 * High-Quality AI Voice generations allowed per UTC calendar month.
 *
 * Premium uses a 400-generation monthly budget, enforced atomically in the
 * subscriber's Durable Object together with its 200-generation daily budget.
 *
 * `0` here no longer means "does not have the feature". Basic sits at zero
 * because it has no *monthly* allowance — its access is the lifetime card
 * grant in VOICE_LIFETIME_CREDITS. Read the two together; the app mirrors both
 * and derives eligibility from the pair.
 */
export const VOICE_MONTHLY_LIMITS: Readonly<Record<Tier, number | null>> = {
  free: 0,
  basic: 0,
  premium: 400,
};

/** Total duration of newly generated Premium card audio per UTC month. */
export const PREMIUM_MONTHLY_AUDIO_MS = 30 * 60 * 1_000;
export const BASIC_MONTHLY_AUDIO_MS = 90_000;

/**
 * Lifetime High-Quality AI Voice card slots, granted per subscriber identity.
 *
 * `null` means the tier has no one-time card grant (Premium). `0` means it does not
 * have the feature at all (Free). A Basic front card claims one slot the first
 * time it is generated; editing or changing voices for that card is free.
 * See lifetimeCredits.ts for the durable ledger.
 */
export const VOICE_LIFETIME_CREDITS: Readonly<Record<Tier, number | null>> = {
  free: 0,
  basic: 10,
  premium: null,
};

/**
 * The UTC calendar month a timestamp falls in, as `YYYY-MM`.
 *
 * UTC rather than device-local: the counter is shared by every device on an
 * account, and a local-time boundary would let someone straddling a timezone
 * roll their quota over twice.
 */
export function monthKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

/** Start of the next UTC month — when the allowance resets. */
export function monthResetsAt(now: number): string {
  const date = new Date(now);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
}
