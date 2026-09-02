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
 * Features covered by the monthly High-Quality AI Voice allowance.
 *
 * Only word-card High-Quality AI Voice generation is charged. Voice-picker
 * previews (`voice_sample`) are deliberately free of monthly quota, whether
 * served from cache or newly generated. Also excludes promotional previews,
 * standalone Text-to-Speech and the four AI text routes.
 */
export const VOICE_QUOTA_FEATURES: readonly Feature[] = ['voice_card'];

export function isVoiceQuotaFeature(feature: Feature): boolean {
  return VOICE_QUOTA_FEATURES.includes(feature);
}

/**
 * High-Quality AI Voice generations allowed per UTC calendar month.
 *
 * `null` means no monthly product quota. Premium is sold as included, so it has
 * none — but "no monthly quota" is not "no limits": Premium is still subject to
 * entitlement verification, the per-minute and per-day abuse limits in
 * ratelimit.ts, the kill switches, and the OpenAI project budget.
 *
 * `0` means the tier does not have the feature. Free and Basic both sit there:
 * AI Voice is Premium. Nothing reaches the quota check on those tiers anyway —
 * FEATURE_TIER rejects them at the entitlement guard first — but the zero is
 * what the app's mirrored copy reads to know the feature is not included.
 */
export const VOICE_MONTHLY_LIMITS: Readonly<Record<Tier, number | null>> = {
  free: 0,
  basic: 0,
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

/**
 * Seconds until the counter may be discarded. One extra month of slack so a
 * clock skew near the boundary cannot expire a live counter.
 */
export function monthlyCounterTtlSeconds(now: number): number {
  const resetsAt = Date.parse(monthResetsAt(now));
  const oneMonth = 60 * 60 * 24 * 31;
  return Math.max(60, Math.ceil((resetsAt - now) / 1000) + oneMonth);
}
